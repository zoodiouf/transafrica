import { supabase } from "./supabase.js";
import { el, showStatus } from "./ui.js";
import { requireRole, field, input, select, btn, parseInteger, dbMessage } from "./pro.js";
import { parseNumber } from "./labels.js";

const TYPES = [["MINIBUS", "Minibus"], ["BUS", "Bus"], ["CAR_7_PLACES", "Car 7 places"],
  ["SEPT_PLACES", "Sept-places"], ["VAN", "Fourgon"]];
const TYPE_LABEL = Object.fromEntries(TYPES);
const STATUS = { ACTIVE: "Actif", MAINTENANCE: "En maintenance", RETIRED: "Retiré" };
const BADGE = { ACTIVE: "ok", MAINTENANCE: "low", RETIRED: "full" };

const statusEl = document.getElementById("status");
const formEl = document.getElementById("form");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);
let agencyId = null;

const fReg = input("text", { max: 20, placeholder: "Ex. DK-123-AB" });
const fModel = input("text", { max: 60, placeholder: "Ex. Toyota Hiace" });
const fType = select(TYPES);
const fSeats = input("text", { mode: "numeric", max: 2, placeholder: "Ex. 14" });
const fCols = input("text", { mode: "numeric", max: 1, value: "4" });
const fLug = input("text", { mode: "decimal", max: 6, placeholder: "Facultatif" });
const fYear = input("text", { mode: "numeric", max: 4, placeholder: "Facultatif" });
const submit = el("button", "btn", "Ajouter le véhicule");
submit.type = "submit";
formEl.append(
  el("h2", "h2", "Nouveau véhicule"),
  field("Immatriculation", fReg), field("Marque et modèle", fModel), field("Type", fType),
  field("Nombre de places (1 à 70)", fSeats), field("Colonnes du plan des sièges (1 à 6)", fCols),
  field("Capacité de la soute en kg (facultatif)", fLug), field("Année (facultatif)", fYear), submit);

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const reg = fReg.value.trim().toUpperCase();
  const model = fModel.value.trim();
  const seats = parseInteger(fSeats.value, 1, 70);
  const cols = parseInteger(fCols.value, 1, 6);
  const lug = fLug.value.trim() === "" ? null : parseNumber(fLug.value);
  const year = fYear.value.trim() === "" ? null : parseInteger(fYear.value, 1980, 2100);

  if (reg.length < 3) return show("Saisissez l'immatriculation du véhicule.", "error");
  if (model.length < 2) return show("Saisissez la marque et le modèle.", "error");
  if (seats === null) return show("Le nombre de places doit être compris entre 1 et 70.", "error");
  if (cols === null) return show("Le nombre de colonnes doit être compris entre 1 et 6.", "error");
  if (fLug.value.trim() !== "" && (lug === null || lug < 0 || lug > 20000)) {
    return show("La capacité de la soute est invalide.", "error");
  }
  if (fYear.value.trim() !== "" && year === null) return show("L'année est invalide.", "error");

  submit.disabled = true;
  show("Enregistrement…", "");
  const ins = await supabase.from("vehicles").insert({
    agency_id: agencyId, registration_number: reg, brand_model: model, vehicle_type: fType.value,
    seat_count: seats, grid_rows: Math.ceil(seats / cols), grid_columns: cols,
    luggage_capacity_kg: lug, year
  }).select("id").single();
  if (ins.error) {
    console.error(ins.error.code || ins.error.message);
    show(dbMessage(ins.error, { "23505": "Cette immatriculation existe déjà dans votre agence.", "23514": "Valeurs invalides pour ce véhicule." }), "error");
    submit.disabled = false;
    return;
  }
  const gen = await supabase.rpc("create_default_seats", { p_vehicle_id: ins.data.id });
  submit.disabled = false;
  if (gen.error) {
    console.error(gen.error.code || gen.error.message);
    show("Véhicule ajouté, mais les sièges n'ont pas pu être générés : utilisez « Générer les sièges ».", "error");
  } else {
    show("Véhicule ajouté avec ses " + gen.data + " sièges.", "");
    for (const f of [fReg, fModel, fSeats, fLug, fYear]) f.value = "";
  }
  await load();
});

async function setStatus(v, status, b) {
  b.disabled = true;
  if (status !== "ACTIVE") {
    const { count, error } = await supabase.from("trips").select("id", { count: "exact", head: true })
      .eq("vehicle_id", v.id).in("status", ["SCHEDULED", "BOARDING"]).gt("departure_at", new Date().toISOString());
    if (error) {
      console.error(error.code || error.message);
      show("Impossible de vérifier les départs de ce véhicule. Réessayez.", "error");
      b.disabled = false;
      return;
    }
    if (count > 0) {
      show("Ce véhicule a " + count + " départ(s) à venir : changez de véhicule ou annulez ces départs d'abord.", "error");
      b.disabled = false;
      return;
    }
  }
  const { error } = await supabase.from("vehicles").update({ status }).eq("id", v.id);
  if (error) {
    console.error(error.code || error.message);
    show(dbMessage(error), "error");
    b.disabled = false;
    return;
  }
  show("Statut du véhicule mis à jour.", "");
  await load();
}

function card(v, seatCount) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", v.registration_number),
    el("span", "badge " + (BADGE[v.status] || "neutral"), STATUS[v.status] || v.status));
  li.append(top, el("div", "route", v.brand_model),
    el("div", "meta", (TYPE_LABEL[v.vehicle_type] || v.vehicle_type) + " · " + v.seat_count + " places"
      + (v.luggage_capacity_kg ? " · soute " + String(Number(v.luggage_capacity_kg)).replace(".", ",") + " kg" : "")),
    el("div", "meta", seatCount + " siège(s) généré(s)"));
  if (seatCount === 0) {
    li.append(btn("Générer les sièges", "", async (b) => {
      b.disabled = true;
      const { error } = await supabase.rpc("create_default_seats", { p_vehicle_id: v.id });
      if (error) {
        console.error(error.code || error.message);
        show(dbMessage(error), "error");
        b.disabled = false;
        return;
      }
      show("Sièges générés.", "");
      await load();
    }));
  }
  if (v.status === "ACTIVE") li.append(btn("Mettre en maintenance", "btn-secondary", (b) => setStatus(v, "MAINTENANCE", b)));
  if (v.status !== "ACTIVE") li.append(btn("Réactiver", "btn-secondary", (b) => setStatus(v, "ACTIVE", b)));
  if (v.status !== "RETIRED") {
    li.append(btn("Retirer du service", "btn-danger", async (b) => {
      if (!confirm("Retirer ce véhicule du service ?")) return;
      await setStatus(v, "RETIRED", b);
    }));
  }
  return li;
}

async function load() {
  const { data, error } = await supabase.from("vehicles")
    .select("id, registration_number, brand_model, vehicle_type, seat_count, status, luggage_capacity_kg")
    .order("registration_number").limit(50);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les véhicules. Réessayez dans un instant.", "error");
    return;
  }
  const counts = await Promise.all((data || []).map((v) =>
    supabase.from("vehicle_seats").select("id", { count: "exact", head: true }).eq("vehicle_id", v.id)));
  listEl.replaceChildren(...(data || []).map((v, i) => card(v, counts[i].count || 0)));
  if (!data || !data.length) listEl.replaceChildren(el("li", "note", "Aucun véhicule pour le moment."));
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_vehicles.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    formEl.hidden = true;
    return;
  }
  agencyId = ctx.profile.agency_id;
  if (!agencyId) {
    show("Votre compte n'est rattaché à aucune agence.", "error");
    formEl.hidden = true;
    return;
  }
  await load();
}

init();

import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney } from "./ui.js";
import {
  requireRole, enrichTrips, TRIP_STATUS, TRIP_BADGE, field, input, select, fillSelect, btn,
  toInputValue, fromInputValue, parseInteger, dbMessage
} from "./pro.js";
import { parseNumber } from "./labels.js";

const statusEl = document.getElementById("status");
const extraEl = document.getElementById("extra");
const formEl = document.getElementById("form");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);

let agencyId = null;
let routes = [];
let vehicles = [];
let drivers = [];

const fRoute = select([]);
const fVehicle = select([]);
const fDriver = select([]);
const fWhen = input("datetime-local");
const fPrice = input("text", { mode: "numeric", max: 9 });
const fFree = input("text", { mode: "decimal", max: 5, value: "20" });
const fExtra = input("text", { mode: "numeric", max: 9, value: "0" });
const submit = el("button", "btn", "Créer le départ");
submit.type = "submit";
formEl.append(el("h2", "h2", "Nouveau départ"),
  field("Itinéraire", fRoute), field("Véhicule", fVehicle), field("Chauffeur (facultatif)", fDriver),
  field("Date et heure de départ (heure de Dakar)", fWhen), field("Prix par siège en FCFA", fPrice),
  field("Bagage gratuit par billet (kg)", fFree), field("Prix du kg en excédent (FCFA)", fExtra), submit);

const fFilter = select([["UP", "À venir"], ["PAST", "Passés"], ["CANCELLED", "Annulés"], ["ALL", "Tous"]]);
const filterCard = el("div", "card");
filterCard.append(field("Afficher", fFilter));
extraEl.append(filterCard);

fRoute.addEventListener("change", () => {
  const r = routes.find((x) => x.id === fRoute.value);
  if (r) fPrice.value = String(r.base_price);
});
fFilter.addEventListener("change", load);

async function driverConflict(driverId, iso, exceptId) {
  if (!driverId) return false;
  const t = new Date(iso).getTime();
  let q = supabase.from("trips").select("id", { count: "exact", head: true })
    .eq("driver_id", driverId).neq("status", "CANCELLED")
    .gte("departure_at", new Date(t - 3 * 3600e3).toISOString())
    .lte("departure_at", new Date(t + 3 * 3600e3).toISOString());
  if (exceptId) q = q.neq("id", exceptId);
  const { count, error } = await q;
  if (error) {
    console.error(error.code || error.message);
    return null;
  }
  return count > 0;
}

const CONFLICT_TEXT = "Ce chauffeur a déjà un départ à moins de 3 heures de celui-ci. Continuer quand même ?";

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const iso = fromInputValue(fWhen.value);
  const price = parseInteger(fPrice.value, 0, 10000000);
  const free = parseNumber(fFree.value);
  const extra = parseInteger(fExtra.value, 0, 1000000);

  if (!fRoute.value) return show("Choisissez un itinéraire.", "error");
  if (!fVehicle.value) return show("Choisissez un véhicule.", "error");
  if (!iso || new Date(iso).getTime() < Date.now() + 10 * 60000) {
    return show("Choisissez une date et une heure de départ (heure de Dakar) au moins 10 minutes dans le futur.", "error");
  }
  if (price === null) return show("Le prix doit être un nombre entier de FCFA.", "error");
  if (free === null || free < 0 || free > 100) return show("Le bagage gratuit doit être compris entre 0 et 100 kg.", "error");
  if (extra === null) return show("Le prix du kg en excédent est invalide.", "error");

  submit.disabled = true;
  const conflict = await driverConflict(fDriver.value || null, iso, null);
  if (conflict === null) {
    show("Impossible de vérifier la disponibilité du chauffeur. Réessayez.", "error");
    submit.disabled = false;
    return;
  }
  if (conflict && !confirm(CONFLICT_TEXT)) {
    submit.disabled = false;
    return;
  }

  show("Création du départ…", "");
  const { error } = await supabase.from("trips").insert({
    agency_id: agencyId, route_id: fRoute.value, vehicle_id: fVehicle.value,
    driver_id: fDriver.value || null, departure_at: iso, price,
    free_luggage_kg: free, extra_kg_price: extra
  });
  submit.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show(dbMessage(error, { "23505": "Ce véhicule a déjà un départ à cette heure." }), "error");
    return;
  }
  show("Départ créé. Il apparaît dans la recherche.", "");
  fWhen.value = "";
  await load();
});

function driverOptions(currentId) {
  return drivers.filter((d) => d.status === "ACTIVE" || d.id === currentId).map((d) => [d.id, d.full_name]);
}

function editPanel(t, li) {
  const old = li.querySelector(".edit-panel");
  if (old) {
    old.remove();
    return;
  }
  const box = el("div", "edit-panel");
  const eWhen = input("datetime-local", { value: toInputValue(t.departure_at) });
  const eDriver = select([]);
  fillSelect(eDriver, driverOptions(t.driver_id), "Aucun chauffeur");
  eDriver.value = t.driver_id || "";
  const ePrice = input("text", { mode: "numeric", max: 9, value: String(t.price) });
  const eFree = input("text", { mode: "decimal", max: 5, value: String(Number(t.free_luggage_kg)).replace(".", ",") });
  const eExtra = input("text", { mode: "numeric", max: 9, value: String(t.extra_kg_price) });
  box.append(
    field("Date et heure de départ (heure de Dakar)", eWhen), field("Chauffeur", eDriver),
    field("Prix par siège en FCFA", ePrice), field("Bagage gratuit (kg)", eFree),
    field("Prix du kg en excédent (FCFA)", eExtra),
    btn("Enregistrer", "", async (b) => {
      const iso = fromInputValue(eWhen.value);
      const price = parseInteger(ePrice.value, 0, 10000000);
      const free = parseNumber(eFree.value);
      const extra = parseInteger(eExtra.value, 0, 1000000);
      if (!iso || new Date(iso).getTime() <= Date.now()) return show("Choisissez une date de départ future (heure de Dakar).", "error");
      if (price === null) return show("Le prix doit être un nombre entier de FCFA.", "error");
      if (free === null || free < 0 || free > 100) return show("Le bagage gratuit doit être compris entre 0 et 100 kg.", "error");
      if (extra === null) return show("Le prix du kg en excédent est invalide.", "error");
      b.disabled = true;
      const conflict = await driverConflict(eDriver.value || null, iso, t.id);
      if (conflict === null) {
        show("Impossible de vérifier la disponibilité du chauffeur. Réessayez.", "error");
        b.disabled = false;
        return;
      }
      if (conflict && !confirm(CONFLICT_TEXT)) {
        b.disabled = false;
        return;
      }
      const { error } = await supabase.from("trips").update({
        departure_at: iso, driver_id: eDriver.value || null, price,
        free_luggage_kg: free, extra_kg_price: extra
      }).eq("id", t.id);
      if (error) {
        console.error(error.code || error.message);
        show(dbMessage(error, { "23505": "Ce véhicule a déjà un départ à cette heure." }), "error");
        b.disabled = false;
        return;
      }
      show("Départ modifié. Les clients concernés sont prévenus si l'horaire change.", "");
      await load();
    }),
    btn("Fermer", "btn-secondary", () => box.remove()));
  li.append(box);
}

function cancelPanel(t, li) {
  const old = li.querySelector(".edit-panel");
  if (old) {
    old.remove();
    return;
  }
  const box = el("div", "edit-panel");
  const reason = input("text", { max: 180, placeholder: "Ex. Panne du véhicule" });
  box.append(
    el("p", "note", "Les clients qui ont payé seront remboursés à 100 % et prévenus. Les réservations en attente seront annulées. Cette action est définitive."),
    field("Motif de l'annulation", reason),
    btn("Confirmer l'annulation du départ", "btn-danger", async (b) => {
      const text = reason.value.trim();
      if (text.length < 3) return show("Indiquez le motif de l'annulation.", "error");
      b.disabled = true;
      const { data, error } = await supabase.rpc("cancel_trip", { p_trip_id: t.id, p_reason: text });
      if (error) {
        console.error(error.code || error.message);
        show(dbMessage(error), "error");
        b.disabled = false;
        return;
      }
      show("Départ annulé. " + data.bookings_refunded + " réservation(s) remboursée(s) : "
        + fmtMoney(data.total_refunded) + ".", "");
      await load();
    }),
    btn("Fermer", "btn-secondary", () => box.remove()));
  li.append(box);
}

function card(t, sold) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", t.origin + " → " + t.destination),
    el("span", "badge " + (TRIP_BADGE[t.status] || "neutral"), TRIP_STATUS[t.status] || t.status));
  const driver = drivers.find((d) => d.id === t.driver_id);
  li.append(top,
    el("div", "meta", "Départ : " + fmtDate.format(new Date(t.departure_at))),
    el("div", "meta", (t.vehicle ? "Véhicule " + t.vehicle : "") + " · " + (driver ? "Chauffeur " + driver.full_name : "Sans chauffeur")),
    el("div", "meta", fmtMoney(t.price) + " · " + (sold || 0) + " / " + t.seats_total + " places vendues"),
    el("div", "meta", "Bagage gratuit " + String(Number(t.free_luggage_kg)).replace(".", ",") + " kg · excédent " + fmtMoney(t.extra_kg_price) + "/kg"));
  if (t.status === "CANCELLED" && t.cancel_reason) li.append(el("div", "meta", "Motif : " + t.cancel_reason));
  if (t.status !== "CANCELLED") {
    const a = el("a", "btn btn-link btn-secondary", "Passagers et chargement");
    a.href = "manifest.html?id=" + encodeURIComponent(t.id);
    li.append(a);
  }
  const open = ["SCHEDULED", "BOARDING"].includes(t.status) && new Date(t.departure_at) > new Date();
  if (open) {
    li.append(btn("Modifier", "btn-secondary", () => editPanel(t, li)),
      btn("Annuler le départ", "btn-danger", () => cancelPanel(t, li)));
  }
  return li;
}

async function load() {
  const since = new Date(Date.now() - 12 * 3600e3).toISOString();
  let q = supabase.from("trips").select(
    "id, route_id, vehicle_id, driver_id, departure_at, price, status, seats_total, free_luggage_kg, extra_kg_price, cancel_reason");
  const f = fFilter.value;
  if (f === "UP") q = q.in("status", ["SCHEDULED", "BOARDING", "DEPARTED"]).gte("departure_at", since).order("departure_at");
  else if (f === "PAST") q = q.neq("status", "CANCELLED").lt("departure_at", since).order("departure_at", { ascending: false });
  else if (f === "CANCELLED") q = q.eq("status", "CANCELLED").order("departure_at", { ascending: false });
  else q = q.order("departure_at", { ascending: false });
  const { data, error } = await q.limit(100);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  let rows;
  let soldMap = new Map();
  try {
    rows = await enrichTrips(data || []);
    if (rows.length) {
      const b = await supabase.from("bookings").select("trip_id, seats_count")
        .in("trip_id", rows.map((t) => t.id)).eq("status", "CONFIRMED");
      if (b.error) throw b.error;
      for (const x of b.data) soldMap.set(x.trip_id, (soldMap.get(x.trip_id) || 0) + x.seats_count);
    }
  } catch (e) {
    console.error(e.code || e.message);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...rows.map((t) => card(t, soldMap.get(t.id))));
  if (!rows.length) listEl.replaceChildren(el("li", "note", "Aucun départ dans cette liste."));
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_trips.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    formEl.hidden = true;
    filterCard.hidden = true;
    return;
  }
  agencyId = ctx.profile.agency_id;
  if (!agencyId) {
    show("Votre compte n'est rattaché à aucune agence.", "error");
    formEl.hidden = true;
    return;
  }
  show("Chargement…", "");
  const [r, v, d] = await Promise.all([
    supabase.from("routes").select("id, name, base_price").eq("is_active", true).order("name"),
    supabase.from("vehicles").select("id, registration_number, seat_count").eq("status", "ACTIVE").order("registration_number"),
    supabase.from("drivers").select("id, full_name, status").order("full_name")
  ]);
  const failed = r.error || v.error || d.error;
  if (failed) {
    console.error(failed.code || failed.message);
    show("Impossible de charger les données de l'agence. Réessayez dans un instant.", "error");
    return;
  }
  routes = r.data;
  vehicles = v.data;
  drivers = d.data;
  fillSelect(fRoute, routes.map((x) => [x.id, x.name]), "Choisir un itinéraire");
  fillSelect(fVehicle, vehicles.map((x) => [x.id, x.registration_number + " (" + x.seat_count + " places)"]), "Choisir un véhicule");
  fillSelect(fDriver, driverOptions(null), "Aucun chauffeur");
  await load();
  if (statusEl.textContent === "Chargement…") show("", "");
}

init();

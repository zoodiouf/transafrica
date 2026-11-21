import { supabase } from "./supabase.js";
import { el, showStatus, fmtMoney } from "./ui.js";
import { requireRole, field, input, select, fillSelect, btn, parseInteger, dbMessage } from "./pro.js";
import { parseNumber } from "./labels.js";

const statusEl = document.getElementById("status");
const formEl = document.getElementById("form");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);

let agencyId = null;
let cityName = new Map();
let editing = null;

const fName = input("text", { max: 80, placeholder: "Facultatif (sinon : Départ - Arrivée)" });
const fOrigin = select([]);
const fDest = select([]);
const fDur = input("text", { mode: "numeric", max: 4, placeholder: "Ex. 90" });
const fDist = input("text", { mode: "decimal", max: 7, placeholder: "Facultatif" });
const fPrice = input("text", { mode: "numeric", max: 9, placeholder: "Ex. 2500" });
const title = el("h2", "h2", "Nouvel itinéraire");
const submit = el("button", "btn", "Ajouter l'itinéraire");
submit.type = "submit";
const cancel = btn("Annuler la modification", "btn-secondary", () => resetForm());
cancel.hidden = true;
formEl.append(title, field("Ville de départ", fOrigin), field("Ville d'arrivée", fDest),
  field("Nom de l'itinéraire", fName), field("Durée du trajet en minutes", fDur),
  field("Distance en km (facultatif)", fDist), field("Prix de base en FCFA", fPrice), submit, cancel);

function resetForm() {
  editing = null;
  for (const f of [fName, fDur, fDist, fPrice]) f.value = "";
  fOrigin.value = "";
  fDest.value = "";
  fOrigin.disabled = false;
  fDest.disabled = false;
  title.textContent = "Nouvel itinéraire";
  submit.textContent = "Ajouter l'itinéraire";
  cancel.hidden = true;
}

function startEdit(r) {
  editing = r;
  fOrigin.value = r.origin_city_id;
  fDest.value = r.destination_city_id;
  fOrigin.disabled = true;
  fDest.disabled = true;
  fName.value = r.name;
  fDur.value = String(r.duration_minutes);
  fDist.value = r.distance_km === null ? "" : String(r.distance_km).replace(".", ",");
  fPrice.value = String(r.base_price);
  title.textContent = "Modifier l'itinéraire";
  submit.textContent = "Enregistrer les modifications";
  cancel.hidden = false;
  show("", "");
  formEl.scrollIntoView({ behavior: "smooth" });
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const origin = editing ? editing.origin_city_id : fOrigin.value;
  const dest = editing ? editing.destination_city_id : fDest.value;
  const dur = parseInteger(fDur.value, 1, 1440);
  const price = parseInteger(fPrice.value, 0, 10000000);
  const dist = fDist.value.trim() === "" ? null : parseNumber(fDist.value);

  if (!origin || !dest) return show("Choisissez la ville de départ et la ville d'arrivée.", "error");
  if (origin === dest) return show("Le départ et l'arrivée doivent être différents.", "error");
  if (dur === null) return show("La durée doit être comprise entre 1 et 1440 minutes.", "error");
  if (price === null) return show("Le prix doit être un nombre entier de FCFA.", "error");
  if (fDist.value.trim() !== "" && (dist === null || dist < 0 || dist > 20000)) {
    return show("La distance est invalide.", "error");
  }
  const name = fName.value.trim() || (cityName.get(origin) + " - " + cityName.get(dest));
  const row = { name, duration_minutes: dur, distance_km: dist, base_price: price };

  submit.disabled = true;
  show("Enregistrement…", "");
  const res = editing
    ? await supabase.from("routes").update(row).eq("id", editing.id)
    : await supabase.from("routes").insert({ agency_id: agencyId, origin_city_id: origin, destination_city_id: dest, ...row });
  submit.disabled = false;
  if (res.error) {
    console.error(res.error.code || res.error.message);
    show(dbMessage(res.error, { "23514": "Valeurs invalides pour cet itinéraire." }), "error");
    return;
  }
  show(editing ? "Itinéraire modifié." : "Itinéraire ajouté.", "");
  resetForm();
  await load();
});

async function toggleActive(r, b) {
  const next = !r.is_active;
  if (!next && !confirm("Désactiver cet itinéraire ? Ses départs à venir ne seront plus proposés au public.")) return;
  b.disabled = true;
  const { error } = await supabase.from("routes").update({ is_active: next }).eq("id", r.id);
  if (error) {
    console.error(error.code || error.message);
    show(dbMessage(error), "error");
    b.disabled = false;
    return;
  }
  show(next ? "Itinéraire réactivé." : "Itinéraire désactivé.", "");
  await load();
}

function card(r) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", r.name),
    el("span", "badge " + (r.is_active ? "ok" : "full"), r.is_active ? "Actif" : "Inactif"));
  li.append(top,
    el("div", "route", (cityName.get(r.origin_city_id) || "?") + " → " + (cityName.get(r.destination_city_id) || "?")),
    el("div", "meta", r.duration_minutes + " min"
      + (r.distance_km ? " · " + String(Number(r.distance_km)).replace(".", ",") + " km" : "")
      + " · prix de base " + fmtMoney(r.base_price)),
    btn("Modifier", "btn-secondary", () => startEdit(r)),
    btn(r.is_active ? "Désactiver" : "Réactiver", r.is_active ? "btn-danger" : "btn-secondary", (b) => toggleActive(r, b)));
  return li;
}

async function load() {
  const { data, error } = await supabase.from("routes")
    .select("id, name, origin_city_id, destination_city_id, duration_minutes, distance_km, base_price, is_active")
    .order("name").limit(100);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les itinéraires. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...(data || []).map(card));
  if (!data || !data.length) listEl.replaceChildren(el("li", "note", "Aucun itinéraire pour le moment."));
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_routes.html");
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
  const { data, error } = await supabase.from("cities").select("id, name").eq("is_active", true).order("name");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les villes. Réessayez dans un instant.", "error");
    return;
  }
  cityName = new Map(data.map((c) => [c.id, c.name]));
  const opts = data.map((c) => [c.id, c.name]);
  fillSelect(fOrigin, opts, "Choisir");
  fillSelect(fDest, opts, "Choisir");
  await load();
}

init();

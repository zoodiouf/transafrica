import { supabase } from "./supabase.js";
import { el, showStatus, fmtMoney, userMessage, requireSession } from "./ui.js";
import { SHIPMENT_CATEGORIES, parseNumber } from "./labels.js";

const statusEl = document.getElementById("status");
const form = document.getElementById("shipment-form");
const doneEl = document.getElementById("done");
const quoteEl = document.getElementById("quote");
const submitBtn = document.getElementById("submit-btn");
const $ = (id) => document.getElementById(id);

const agencySel = $("agency"), originSel = $("origin"), destSel = $("destination");
const catSel = $("category"), weightIn = $("weight"), descIn = $("desc"), valueIn = $("value");

let quoteToken = 0;
const show = (m, k) => showStatus(statusEl, m, k);

async function updateQuote() {
  const my = ++quoteToken;
  const w = parseNumber(weightIn.value);
  if (!agencySel.value || w === null || w < 0.1 || w > 50) {
    quoteEl.textContent = "Choisissez une agence et un poids (0,1 à 50 kg) pour voir le prix.";
    return;
  }
  const { data, error } = await supabase.rpc("quote_shipment", {
    p_agency_id: agencySel.value, p_category: catSel.value, p_weight_kg: w
  });
  if (my !== quoteToken) return;
  if (error) {
    console.error(error.code || error.message);
    quoteEl.textContent = "Prix indisponible pour le moment.";
    return;
  }
  quoteEl.textContent = data === null
    ? "Cette catégorie n'est pas proposée par cette agence."
    : "Prix : " + fmtMoney(data);
}

function renderDone(r) {
  doneEl.replaceChildren(
    el("p", "ok-text", "Envoi enregistré."),
    el("div", "meta", "Numéro de suivi"),
    el("div", "ticket-code", r.tracking_number),
    el("div", "meta", "Code de retrait à transmettre au destinataire"),
    el("div", "ticket-code", r.pickup_code),
    el("div", "price-line", "Prix à régler à l'agence : " + fmtMoney(r.price)),
    el("p", "note", "Notez ces deux informations. Le code vous sera redemandé pour retirer le colis ; vous le retrouvez aussi dans « Mes colis »."));
  const a = el("a", "btn btn-link", "Voir mes colis");
  a.href = "shipments.html";
  const b = el("a", "btn btn-secondary btn-link", "Envoyer un autre colis");
  b.href = "shipment_new.html";
  doneEl.append(a, b);
  form.hidden = true;
  doneEl.hidden = false;
  window.scrollTo(0, 0);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const w = parseNumber(weightIn.value);
  const desc = descIn.value.trim();
  const rawValue = valueIn.value.trim();
  const declared = rawValue === "" ? null : Number(rawValue.replace(/\s/g, ""));
  const sName = $("s-name").value.trim(), sPhone = $("s-phone").value.trim();
  const rName = $("r-name").value.trim(), rPhone = $("r-phone").value.trim();
  const phoneOk = (p) => /^\+?[0-9 ]{8,20}$/.test(p);

  if (!agencySel.value) return show("Choisissez une agence.", "error");
  if (!originSel.value || !destSel.value) return show("Choisissez les villes de départ et d'arrivée.", "error");
  if (originSel.value === destSel.value) return show("Le départ et l'arrivée doivent être différents.", "error");
  if (w === null || w < 0.1 || w > 50) return show("Le poids doit être compris entre 0,1 et 50 kg.", "error");
  if (!desc || desc.length > 200) return show("Décrivez le contenu (200 caractères maximum).", "error");
  if (declared !== null && (!Number.isInteger(declared) || declared < 0)) {
    return show("La valeur déclarée doit être un nombre entier de FCFA.", "error");
  }
  if (catSel.value === "VALUABLE" && !(declared > 0)) {
    return show("Indiquez la valeur déclarée d'un objet de valeur.", "error");
  }
  if (sName.length < 2 || rName.length < 2) return show("Saisissez le nom de l'expéditeur et du destinataire.", "error");
  if (!phoneOk(sPhone) || !phoneOk(rPhone)) return show("Saisissez des téléphones valides, par exemple +221 77 000 00 00.", "error");

  submitBtn.disabled = true;
  show("Enregistrement en cours…", "");
  const { data, error } = await supabase.rpc("create_shipment", {
    p_agency_id: agencySel.value,
    p_origin_city: originSel.value,
    p_destination_city: destSel.value,
    p_category: catSel.value,
    p_description: desc,
    p_weight_kg: w,
    p_declared_value: declared,
    p_sender_name: sName,
    p_sender_phone: sPhone,
    p_receiver_name: rName,
    p_receiver_phone: rPhone
  });
  submitBtn.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    return;
  }
  show("", "");
  renderDone(data);
});

for (const node of [agencySel, catSel]) node.addEventListener("change", updateQuote);
weightIn.addEventListener("input", updateQuote);

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  const session = await requireSession(supabase, "shipment_new.html");
  if (!session) return;

  for (const [v, t] of Object.entries(SHIPMENT_CATEGORIES)) catSel.append(new Option(t, v));

  const [agencies, cities, profile] = await Promise.all([
    supabase.from("agencies_public").select("id, name").order("name"),
    supabase.from("cities").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("full_name, phone").eq("id", session.user.id).maybeSingle()
  ]);
  if (agencies.error || cities.error) {
    console.error((agencies.error || cities.error).code || (agencies.error || cities.error).message);
    show("Impossible de charger les agences et les villes. Réessayez dans un instant.", "error");
    return;
  }
  for (const a of agencies.data) agencySel.append(new Option(a.name, a.id));
  for (const c of cities.data) {
    originSel.append(new Option(c.name, c.id));
    destSel.append(new Option(c.name, c.id));
  }
  if (profile.data) {
    $("s-name").value = profile.data.full_name || "";
    $("s-phone").value = profile.data.phone || "";
  }
}

init();

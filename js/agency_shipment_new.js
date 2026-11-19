import { supabase } from "./supabase.js";
import { el, showStatus, fmtMoney, userMessage } from "./ui.js";
import { requireRole } from "./pro.js";
import { SHIPMENT_CATEGORIES, parseNumber } from "./labels.js";

const statusEl = document.getElementById("status");
const form = document.getElementById("shipment-form");
const doneEl = document.getElementById("done");
const quoteEl = document.getElementById("quote");
const submitBtn = document.getElementById("submit-btn");
const $ = (id) => document.getElementById(id);

const originSel = $("origin"), destSel = $("destination");
const catSel = $("category"), weightIn = $("weight"), descIn = $("desc"), valueIn = $("value");

let agencyId = null;
let quoteToken = 0;
const show = (m, k) => showStatus(statusEl, m, k);

async function updateQuote() {
  const my = ++quoteToken;
  const w = parseNumber(weightIn.value);
  if (!agencyId || w === null || w < 0.1 || w > 50) {
    quoteEl.textContent = "Choisissez un poids (0,1 à 50 kg) pour voir le prix.";
    return;
  }
  const { data, error } = await supabase.rpc("quote_shipment", {
    p_agency_id: agencyId, p_category: catSel.value, p_weight_kg: w
  });
  if (my !== quoteToken) return;
  if (error) {
    console.error(error.code || error.message);
    quoteEl.textContent = "Prix indisponible pour le moment.";
    return;
  }
  quoteEl.textContent = data === null
    ? "Cette catégorie n'est pas proposée par votre agence."
    : "Prix : " + fmtMoney(data);
}

function renderDone(r) {
  doneEl.replaceChildren(
    el("p", "ok-text", "Colis enregistré."),
    el("div", "meta", "Numéro de suivi"),
    el("div", "ticket-code", r.tracking_number),
    el("div", "meta", "Code de retrait à remettre au client pour le destinataire"),
    el("div", "ticket-code", r.pickup_code),
    el("div", "price-line", "Prix à encaisser : " + fmtMoney(r.price)),
    el("p", "note", "Notez le numéro et le code maintenant : le code ne sera plus affiché. Si besoin, l'administrateur de l'agence peut en générer un nouveau."));
  const a = el("a", "btn btn-link", "Voir les colis de l'agence");
  a.href = "agency_shipments.html";
  const b = el("a", "btn btn-secondary btn-link", "Enregistrer un autre colis");
  b.href = "agency_shipment_new.html";
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
    p_agency_id: agencyId,
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

catSel.addEventListener("change", updateQuote);
weightIn.addEventListener("input", updateQuote);

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT"], "agency_shipment_new.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    form.hidden = true;
    return;
  }
  agencyId = ctx.profile.agency_id;
  if (!agencyId) {
    show("Votre compte n'est rattaché à aucune agence.", "error");
    form.hidden = true;
    return;
  }

  for (const [v, t] of Object.entries(SHIPMENT_CATEGORIES)) catSel.append(new Option(t, v));
  const { data, error } = await supabase.from("cities").select("id, name").eq("is_active", true).order("name");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les villes. Réessayez dans un instant.", "error");
    return;
  }
  for (const c of data) {
    originSel.append(new Option(c.name, c.id));
    destSel.append(new Option(c.name, c.id));
  }
}

init();

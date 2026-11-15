import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate } from "./ui.js";
import { SHIPMENT_STATUS } from "./labels.js";

const form = document.getElementById("track-form");
const numberIn = document.getElementById("number");
const phoneIn = document.getElementById("phone");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const show = (m, k) => showStatus(statusEl, m, k);

function render(rows) {
  const first = rows[0];
  const head = el("div", "card trip-info");
  head.append(
    el("div", "route", first.origin_city + " → " + first.destination_city),
    el("div", "meta", first.agency_name));

  const ul = el("ul", "timeline");
  for (const r of rows) {
    const li = el("li", "tl-item");
    li.append(el("div", "tl-status", SHIPMENT_STATUS[r.status] || r.status));
    const where = r.city_name ? r.city_name + " · " : "";
    li.append(el("div", "meta", where + fmtDate.format(new Date(r.event_at))));
    if (r.note) li.append(el("div", "meta", r.note));
    ul.append(li);
  }
  resultEl.replaceChildren(head, ul);
  resultEl.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  resultEl.hidden = true;
  const n = numberIn.value.trim().toUpperCase();
  const p = phoneIn.value.trim();
  if (!/^CL-[0-9A-F]{10}$/.test(n)) {
    show("Le numéro de suivi doit ressembler à CL-XXXXXXXXXX.", "error");
    return;
  }
  if (!/^\+?[0-9 ]{8,20}$/.test(p)) {
    show("Saisissez un téléphone valide.", "error");
    return;
  }
  submitBtn.disabled = true;
  show("Recherche en cours…", "");
  const { data, error } = await supabase.rpc("get_public_tracking", { p_tracking: n, p_phone: p });
  submitBtn.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de rechercher ce colis. Réessayez dans un instant.", "error");
    return;
  }
  if (!data || !data.length) {
    show("Aucun colis trouvé. Vérifiez le numéro et le téléphone.", "error");
    return;
  }
  show("", "");
  render(data);
});

if (!supabase) {
  show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
} else {
  const n = (new URLSearchParams(location.search).get("n") || "").toUpperCase();
  if (/^CL-[0-9A-F]{10}$/.test(n)) numberIn.value = n;
}

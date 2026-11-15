import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, paramId, userMessage, requireSession } from "./ui.js";
import { LUGGAGE_TYPES, LUGGAGE_STATUS, parseNumber } from "./labels.js";

const statusEl = document.getElementById("status");
const infoEl = document.getElementById("trip-info");
const summaryEl = document.getElementById("summary");
const listEl = document.getElementById("list");
const form = document.getElementById("luggage-form");
const typeSel = document.getElementById("type");
const weightIn = document.getElementById("weight");
const descIn = document.getElementById("desc");
const submitBtn = document.getElementById("submit-btn");

const id = paramId();
let canEdit = false;

const show = (m, k) => showStatus(statusEl, m, k);

function renderSummary(s) {
  if (!s) { summaryEl.hidden = true; return; }
  const kg = (n) => String(Number(n)).replace(".", ",") + " kg";
  summaryEl.replaceChildren(
    el("div", "meta", "Franchise : " + kg(s.allowance_kg) + " (" + s.tickets_count
      + (Number(s.tickets_count) > 1 ? " billets" : " billet") + ")"),
    el("div", "meta", "Poids compté (hors bagage à main) : " + kg(s.counted_weight_kg)),
    el("div", "meta", "Excédent : " + kg(s.extra_kg)),
    el("div", "price-line", "Supplément estimé : " + fmtMoney(s.extra_fee))
  );
  summaryEl.hidden = false;
}

function bagCard(b) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", LUGGAGE_TYPES[b.luggage_type] || b.luggage_type),
             el("span", "badge neutral", LUGGAGE_STATUS[b.status] || b.status));
  li.append(top,
    el("div", "meta", String(Number(b.weight_kg)).replace(".", ",") + " kg"
      + (b.description ? " · " + b.description : "")),
    el("div", "meta", "Supplément : " + fmtMoney(b.fee)),
    el("div", "ticket-code", b.tag_code));

  if (b.status === "DECLARED" && canEdit) {
    const btn = el("button", "btn btn-danger", "Retirer ce bagage");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      if (!confirm("Retirer ce bagage ?")) return;
      btn.disabled = true;
      const { error } = await supabase.rpc("cancel_luggage", { p_luggage_id: b.id });
      if (error) {
        console.error(error.code || error.message);
        show(userMessage(error), "error");
        btn.disabled = false;
        return;
      }
      show("", "");
      await load();
    });
    li.append(btn);
  }
  return li;
}

async function load() {
  const [sum, bags] = await Promise.all([
    supabase.rpc("luggage_summary", { p_booking_id: id }),
    supabase.from("luggage")
      .select("id, luggage_type, weight_kg, description, fee, tag_code, status")
      .eq("booking_id", id).order("seq")
  ]);
  if (sum.error || bags.error) {
    console.error((sum.error || bags.error).code || (sum.error || bags.error).message);
    show("Impossible de charger vos bagages. Réessayez dans un instant.", "error");
    return;
  }
  renderSummary((sum.data || [])[0]);
  const rows = bags.data || [];
  listEl.replaceChildren(...rows.map(bagCard));
  if (!rows.length) show("Aucun bagage déclaré pour cette réservation.", "");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const w = parseNumber(weightIn.value);
  if (w === null || w < 0.1 || w > 100) {
    show("Saisissez un poids entre 0,1 et 100 kg.", "error");
    return;
  }
  submitBtn.disabled = true;
  show("Ajout en cours…", "");
  const { error } = await supabase.rpc("declare_luggage", {
    p_booking_id: id,
    p_type: typeSel.value,
    p_weight_kg: w,
    p_description: descIn.value.trim() || null
  });
  submitBtn.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    return;
  }
  weightIn.value = "";
  descIn.value = "";
  show("Bagage ajouté.", "");
  await load();
});

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  if (!id) {
    show("Réservation introuvable.", "error");
    return;
  }
  const session = await requireSession(supabase, "luggage.html?id=" + id);
  if (!session) return;

  show("Chargement…", "");
  const { data, error } = await supabase.rpc("get_my_bookings");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger la réservation. Réessayez dans un instant.", "error");
    return;
  }
  const b = (data || []).find((x) => x.booking_id === id);
  if (!b) {
    show("Réservation introuvable.", "error");
    return;
  }
  infoEl.replaceChildren(
    el("div", "agency", "Réservation " + b.reference),
    el("div", "route", b.origin_city + " → " + b.destination_city),
    el("div", "meta", b.agency_name + " · départ " + fmtDate.format(new Date(b.departure_at)))
  );
  infoEl.hidden = false;

  if (b.status !== "CONFIRMED") {
    show("Les bagages se déclarent une fois la réservation payée et confirmée.", "");
    return;
  }
  canEdit = new Date(b.departure_at) > new Date(b.server_now);

  for (const [v, t] of Object.entries(LUGGAGE_TYPES)) typeSel.append(new Option(t, v));
  form.hidden = !canEdit;
  if (!canEdit) show("Le départ est passé : les bagages ne peuvent plus être modifiés.", "");
  else show("", "");
  await load();
}

init();

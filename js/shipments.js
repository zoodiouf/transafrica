import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, userMessage, requireSession } from "./ui.js";
import { SHIPMENT_CATEGORIES, SHIPMENT_STATUS, SHIPMENT_BADGE } from "./labels.js";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);

function card(s) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", s.tracking_number),
             el("span", "badge " + (SHIPMENT_BADGE[s.status] || "neutral"), SHIPMENT_STATUS[s.status] || s.status));
  li.append(top,
    el("div", "route", s.origin_city + " → " + s.destination_city),
    el("div", "meta", s.agency_name + " · " + (SHIPMENT_CATEGORIES[s.category] || s.category)
      + " · " + String(Number(s.weight_kg)).replace(".", ",") + " kg"),
    el("div", "meta", "Destinataire : " + s.receiver_name),
    el("div", "meta", "Prix : " + fmtMoney(s.price) + " · créé le " + fmtDate.format(new Date(s.created_at))));

  const closed = ["DELIVERED", "RETURNED", "CANCELLED"].includes(s.status);
  if (!closed) {
    const codeLine = el("div", "ticket-code", "••••••");
    const toggle = el("button", "btn btn-secondary", "Afficher le code de retrait");
    toggle.type = "button";
    let shown = false;
    toggle.addEventListener("click", () => {
      shown = !shown;
      codeLine.textContent = shown ? s.pickup_code : "••••••";
      toggle.textContent = shown ? "Masquer le code de retrait" : "Afficher le code de retrait";
    });
    li.append(codeLine, toggle);
  }

  const track = el("a", "btn btn-link", "Suivre ce colis");
  track.href = "track.html?n=" + encodeURIComponent(s.tracking_number);
  li.append(track);

  if (s.status === "CREATED") {
    const cancel = el("button", "btn btn-danger", "Annuler cet envoi");
    cancel.type = "button";
    cancel.addEventListener("click", async () => {
      if (!confirm("Annuler cet envoi ?")) return;
      cancel.disabled = true;
      const { error } = await supabase.rpc("set_shipment_status", {
        p_shipment_id: s.shipment_id, p_status: "CANCELLED", p_city_id: null, p_note: null
      });
      if (error) {
        console.error(error.code || error.message);
        show(userMessage(error), "error");
        cancel.disabled = false;
        return;
      }
      await load();
    });
    li.append(cancel);
  }
  return li;
}

async function load() {
  show("Chargement…", "");
  const { data, error } = await supabase.rpc("get_my_shipments");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger vos colis. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...(data || []).map(card));
  if (!data || !data.length) show("Vous n'avez encore envoyé aucun colis.", "");
  else show("", "");
}

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  const session = await requireSession(supabase, "shipments.html");
  if (!session) return;
  await load();
}

init();

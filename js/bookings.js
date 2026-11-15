import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, requireSession } from "./ui.js";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const LABELS = {
  PENDING: "En attente de paiement", CONFIRMED: "Confirmée", CANCELLED: "Annulée",
  EXPIRED: "Expirée", COMPLETED: "Terminée", NO_SHOW: "Absent"
};
const BADGES = {
  PENDING: "low", CONFIRMED: "ok", CANCELLED: "full",
  EXPIRED: "neutral", COMPLETED: "neutral", NO_SHOW: "full"
};

const show = (m, k) => showStatus(statusEl, m, k);

function item(b) {
  const expired = b.status === "PENDING" && new Date(b.expires_at) <= new Date(b.server_now);
  const status = expired ? "EXPIRED" : b.status;

  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", b.reference), el("span", "badge " + BADGES[status], LABELS[status] || status));
  li.append(
    top,
    el("div", "route", b.origin_city + " → " + b.destination_city),
    el("div", "meta", b.agency_name + " · " + fmtDate.format(new Date(b.departure_at))),
    el("div", "meta", b.seats_count + (b.seats_count > 1 ? " places" : " place") + " · " + fmtMoney(b.total_amount))
  );

  const a = el("a", "btn btn-link");
  if (status === "CONFIRMED") {
    a.textContent = "Voir mes billets";
    a.href = "tickets.html?id=" + encodeURIComponent(b.booking_id);
  } else if (status === "PENDING") {
    a.textContent = "Payer";
    a.href = "booking.html?id=" + encodeURIComponent(b.booking_id);
  } else {
    a.textContent = "Détails";
    a.href = "booking.html?id=" + encodeURIComponent(b.booking_id);
  }
  li.append(a);
  return li;
}

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  const session = await requireSession(supabase, "bookings.html");
  if (!session) return;

  show("Chargement…", "");
  const { data, error } = await supabase.rpc("get_my_bookings");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger vos réservations. Réessayez dans un instant.", "error");
    return;
  }
  if (!data || !data.length) {
    show("Vous n'avez encore aucune réservation.", "");
    return;
  }
  show("", "");
  listEl.replaceChildren(...data.map(item));
}

init();

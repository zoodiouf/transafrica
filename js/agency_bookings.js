import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, userMessage } from "./ui.js";
import { requireRole, enrichTrips, btn } from "./pro.js";
import { ticketList } from "./qr.js";

const LABEL = { PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", EXPIRED: "Expirée", COMPLETED: "Terminée", NO_SHOW: "Absent" };
const BADGE = { PENDING: "low", CONFIRMED: "ok", CANCELLED: "full", EXPIRED: "neutral", COMPLETED: "neutral", NO_SHOW: "full" };

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const countEl = document.getElementById("count");
const filterSel = document.getElementById("filter");
const searchIn = document.getElementById("search");
const show = (m, k) => showStatus(statusEl, m, k);

let role = null;
let bookings = [];
let tripMap = new Map();

async function cancel(bk, b) {
  b.disabled = true;
  const q = await supabase.rpc("get_cancellation_quote", { p_booking_id: bk.id });
  if (q.error) {
    console.error(q.error.code || q.error.message);
    show(userMessage(q.error), "error");
    b.disabled = false;
    return;
  }
  const quote = q.data || {};
  if (!quote.can_cancel) {
    show(quote.reason || "Annulation impossible.", "error");
    b.disabled = false;
    return;
  }
  if (!confirm("Annuler cette réservation et rembourser " + fmtMoney(quote.refund_amount) + " au client ?")) {
    b.disabled = false;
    return;
  }
  const { data, error } = await supabase.rpc("cancel_confirmed_booking", {
    p_booking_id: bk.id, p_reason: "Annulation par l'agence"
  });
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    b.disabled = false;
    return;
  }
  show("Réservation annulée. À rembourser au client : " + fmtMoney(data.refund_amount) + ".", "");
  await load();
}

function card(bk) {
  const t = tripMap.get(bk.trip_id);
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", bk.reference),
    el("span", "badge " + (BADGE[bk.status] || "neutral"), LABEL[bk.status] || bk.status));
  li.append(top);
  if (t) {
    li.append(el("div", "route", t.origin + " → " + t.destination),
      el("div", "meta", "Départ : " + fmtDate.format(new Date(t.departure_at))));
  }
  li.append(
    el("div", "meta", (bk.channel === "COUNTER" ? "Vente au guichet" : "Réservation en ligne") + " · "
      + bk.seats_count + (bk.seats_count > 1 ? " places" : " place") + " · " + fmtMoney(bk.total_amount)),
    el("div", "meta", bk.contact_name + " · " + bk.contact_phone));

  if (bk.status === "CONFIRMED" && bk.channel === "COUNTER") {
    const holder = el("div");
    holder.hidden = true;
    li.append(btn("Voir les billets", "btn-secondary", async (b) => {
      if (!holder.hidden) {
        holder.hidden = true;
        b.textContent = "Voir les billets";
        return;
      }
      b.disabled = true;
      const { data, error } = await supabase.rpc("get_counter_tickets", { p_booking_id: bk.id });
      b.disabled = false;
      if (error) {
        console.error(error.code || error.message);
        show(userMessage(error), "error");
        return;
      }
      holder.replaceChildren(await ticketList(data || []));
      holder.hidden = false;
      b.textContent = "Masquer les billets";
    }), holder);
  }

  const upcoming = t && ["SCHEDULED", "BOARDING"].includes(t.status) && new Date(t.departure_at) > new Date();
  if (role === "AGENCY_ADMIN" && bk.status === "CONFIRMED" && upcoming) {
    li.append(btn("Annuler et rembourser", "btn-danger", (b) => cancel(bk, b)));
  }
  return li;
}

function matches(bk) {
  const f = filterSel.value;
  if (f !== "ALL" && bk.status !== f) return false;
  const q = searchIn.value.trim().toLowerCase();
  if (!q) return true;
  return [bk.reference, bk.contact_name, bk.contact_phone].some((v) => String(v || "").toLowerCase().includes(q));
}

function render() {
  const rows = bookings.filter(matches);
  listEl.replaceChildren(...rows.map(card));
  countEl.textContent = rows.length + (rows.length > 1 ? " réservations affichées" : " réservation affichée")
    + " sur " + bookings.length + " chargées (100 maximum).";
}

async function load() {
  const { data, error } = await supabase.from("bookings")
    .select("id, reference, trip_id, contact_name, contact_phone, status, channel, seats_count, total_amount, created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les réservations. Réessayez dans un instant.", "error");
    return;
  }
  bookings = data || [];
  tripMap = new Map();
  const ids = [...new Set(bookings.map((b) => b.trip_id))];
  if (ids.length) {
    const tr = await supabase.from("trips")
      .select("id, route_id, vehicle_id, departure_at, status, seats_total").in("id", ids);
    if (tr.error) {
      console.error(tr.error.code || tr.error.message);
      show("Impossible de charger les départs liés. Réessayez dans un instant.", "error");
      return;
    }
    try {
      for (const t of await enrichTrips(tr.data || [])) tripMap.set(t.id, t);
    } catch (e) {
      console.error(e.code || e.message);
    }
  }
  render();
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT"], "agency_bookings.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  role = ctx.profile.role;
  filterSel.addEventListener("change", render);
  searchIn.addEventListener("input", render);
  show("Chargement…", "");
  await load();
  if (statusEl.textContent === "Chargement…") show("", "");
}

init();

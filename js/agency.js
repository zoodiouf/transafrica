import { supabase } from "./supabase.js";
import { el, showStatus, fmtMoney } from "./ui.js";
import { requireRole, enrichTrips, tripCard } from "./pro.js";

const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);

function tile(label, value) {
  const d = el("div", "stat");
  d.append(el("div", "stat-value", value), el("div", "stat-label", label));
  return d;
}

async function loadStats() {
  const { data, error } = await supabase.rpc("get_stats");
  if (error || !data) {
    if (error) console.error(error.code || error.message);
    return;
  }
  const n = (k) => Number(data[k]) || 0;
  statsEl.replaceChildren(
    tile("Chiffre d'affaires net (30 jours)", fmtMoney(n("revenue_gross"))),
    tile("Remboursé (30 jours)", fmtMoney(n("refunded_total"))),
    tile("Réservations confirmées", String(n("bookings_confirmed"))),
    tile("Billets validés", String(n("tickets_validated"))),
    tile("Colis créés", String(n("shipments_created"))),
    tile("Reste à reverser", fmtMoney(n("payout_pending_net"))));
  statsEl.hidden = false;
}

async function loadTrips() {
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("trips")
    .select("id, route_id, vehicle_id, departure_at, status, seats_total")
    .gte("departure_at", since).order("departure_at").limit(30);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  let rows;
  try {
    rows = await enrichTrips(data || []);
  } catch (e) {
    console.error(e.code || e.message);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...rows.map(tripCard));
  show(rows.length ? "" : "Aucun départ récent ou à venir.", "");
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT"], "agency.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  show("Chargement…", "");
  const jobs = [loadTrips()];
  if (ctx.profile.role === "AGENCY_ADMIN") jobs.push(loadStats());
  await Promise.all(jobs);
}

init();

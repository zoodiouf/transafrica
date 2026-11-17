import { supabase } from "./supabase.js";
import { showStatus } from "./ui.js";
import { requireRole, enrichTrips, tripCard } from "./pro.js";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);

async function init() {
  const ctx = await requireRole(["DRIVER"], "driver.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  show("Chargement…", "");

  const { data: mine, error: e1 } = await supabase
    .from("drivers").select("id").eq("user_id", ctx.profile.id);
  if (e1) {
    console.error(e1.code || e1.message);
    show("Impossible de charger votre fiche chauffeur. Réessayez dans un instant.", "error");
    return;
  }
  if (!mine || !mine.length) {
    show("Aucune fiche chauffeur n'est liée à votre compte. Contactez votre agence.", "");
    return;
  }

  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("trips")
    .select("id, route_id, vehicle_id, departure_at, status, seats_total")
    .in("driver_id", mine.map((d) => d.id))
    .gte("departure_at", since).neq("status", "CANCELLED")
    .order("departure_at").limit(30);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger vos départs. Réessayez dans un instant.", "error");
    return;
  }
  let rows;
  try {
    rows = await enrichTrips(data || []);
  } catch (e) {
    console.error(e.code || e.message);
    show("Impossible de charger vos départs. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...rows.map(tripCard));
  show(rows.length ? "" : "Aucun départ ne vous est affecté pour le moment.", "");
}

init();

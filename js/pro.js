import { supabase } from "./supabase.js";
import { el, fmtDate } from "./ui.js";

export const TRIP_STATUS = {
  SCHEDULED: "Programmé", BOARDING: "Embarquement", DEPARTED: "Parti",
  ARRIVED: "Arrivé", CANCELLED: "Annulé"
};
export const TRIP_BADGE = {
  SCHEDULED: "neutral", BOARDING: "low", DEPARTED: "ok", ARRIVED: "ok", CANCELLED: "full"
};

// Le contrôle de rôle sert à guider l'affichage : la vraie protection est dans la base.
export async function requireRole(roles, nextPath) {
  if (!supabase) {
    return { error: "Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js." };
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.replace("login.html?next=" + encodeURIComponent(nextPath));
    return { redirected: true };
  }
  const { data: p, error } = await supabase
    .from("profiles").select("id, role, agency_id, is_suspended, full_name")
    .eq("id", data.session.user.id).maybeSingle();
  if (error || !p) {
    if (error) console.error(error.code || error.message);
    return { error: "Impossible de charger votre profil. Réessayez dans un instant." };
  }
  if (p.is_suspended) return { error: "Votre compte est suspendu. Contactez le support." };
  if (!roles.includes(p.role)) return { error: "Cet espace est réservé au personnel autorisé." };
  return { session: data.session, profile: p };
}

export async function enrichTrips(trips) {
  if (!trips.length) return [];
  const routeIds = [...new Set(trips.map((t) => t.route_id))];
  const vehicleIds = [...new Set(trips.map((t) => t.vehicle_id))];
  const [routes, vehicles] = await Promise.all([
    supabase.from("routes").select("id, origin_city_id, destination_city_id").in("id", routeIds),
    supabase.from("vehicles").select("id, registration_number").in("id", vehicleIds)
  ]);
  if (routes.error) throw routes.error;
  if (vehicles.error) throw vehicles.error;
  const cityIds = [...new Set(routes.data.flatMap((r) => [r.origin_city_id, r.destination_city_id]))];
  const cities = cityIds.length
    ? await supabase.from("cities").select("id, name").in("id", cityIds)
    : { data: [], error: null };
  if (cities.error) throw cities.error;

  const rmap = new Map(routes.data.map((r) => [r.id, r]));
  const vmap = new Map(vehicles.data.map((v) => [v.id, v.registration_number]));
  const cmap = new Map(cities.data.map((c) => [c.id, c.name]));
  return trips.map((t) => {
    const r = rmap.get(t.route_id);
    return {
      ...t,
      origin_id: r ? r.origin_city_id : null,
      destination_id: r ? r.destination_city_id : null,
      origin: (r && cmap.get(r.origin_city_id)) || "?",
      destination: (r && cmap.get(r.destination_city_id)) || "?",
      vehicle: vmap.get(t.vehicle_id) || ""
    };
  });
}

export function tripCard(t) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(
    el("span", "agency", t.origin + " → " + t.destination),
    el("span", "badge " + (TRIP_BADGE[t.status] || "neutral"), TRIP_STATUS[t.status] || t.status));
  li.append(
    top,
    el("div", "meta", "Départ : " + fmtDate.format(new Date(t.departure_at))),
    el("div", "meta", (t.vehicle ? "Véhicule " + t.vehicle + " · " : "") + t.seats_total + " places"));
  const a = el("a", "btn btn-link", "Passagers et chargement");
  a.href = "manifest.html?id=" + encodeURIComponent(t.id);
  li.append(a);
  return li;
}

import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, paramId, userMessage } from "./ui.js";
import { requireRole, enrichTrips, TRIP_STATUS, TRIP_BADGE } from "./pro.js";
import { LUGGAGE_TYPES, LUGGAGE_STATUS, SHIPMENT_CATEGORIES, SHIPMENT_STATUS, parseNumber } from "./labels.js";

const AGE = { ADULT: "Adulte", CHILD: "Enfant", INFANT: "Bébé" };
const TRANSITIONS = {
  SCHEDULED: [["BOARDING", "Ouvrir l'embarquement"], ["DEPARTED", "Marquer comme parti"]],
  BOARDING: [["DEPARTED", "Marquer comme parti"]],
  DEPARTED: [["ARRIVED", "Marquer comme arrivé"]]
};
const SHIP_ACTIONS = {
  DROPPED_AT_AGENCY: ["LOADED", "Charger le colis"],
  LOADED: ["IN_TRANSIT", "Colis en route"],
  IN_TRANSIT: ["ARRIVED", "Colis arrivé"]
};

const statusEl = document.getElementById("status");
const infoEl = document.getElementById("trip-info");
const actionsEl = document.getElementById("trip-actions");
const paxEl = document.getElementById("pax");
const paxSummaryEl = document.getElementById("pax-summary");
const lugEl = document.getElementById("luggage");
const shipEl = document.getElementById("shipments");

const id = paramId();
let isStaff = false;
let trip = null;

const show = (m, k) => showStatus(statusEl, m, k);
const kg = (n) => String(Number(n)).replace(".", ",") + " kg";

// Lance une action puis recharge la page ; renvoie true si elle a réussi.
async function call(button, request, okMessage) {
  button.disabled = true;
  const { error } = await request;
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    button.disabled = false;
    return false;
  }
  show(okMessage || "", "");
  await loadAll();
  return true;
}

function renderInfo() {
  const badge = el("span", "badge " + (TRIP_BADGE[trip.status] || "neutral"), TRIP_STATUS[trip.status] || trip.status);
  infoEl.replaceChildren(
    badge,
    el("div", "route", trip.origin + " → " + trip.destination),
    el("div", "meta", "Départ : " + fmtDate.format(new Date(trip.departure_at))),
    el("div", "meta", (trip.vehicle ? "Véhicule " + trip.vehicle + " · " : "") + trip.seats_total + " places"));
  infoEl.hidden = false;

  actionsEl.replaceChildren();
  for (const [status, label] of TRANSITIONS[trip.status] || []) {
    const b = el("button", "btn", label);
    b.type = "button";
    b.addEventListener("click", async () => {
      if (!confirm(label + " ?")) return;
      await call(b, supabase.rpc("set_trip_status", { p_trip_id: id, p_status: status }),
        "Statut du départ mis à jour.");
    });
    actionsEl.append(b);
  }
}

function renderPassengers(rows) {
  const used = rows.filter((r) => r.ticket_status === "USED").length;
  paxSummaryEl.textContent = rows.length + (rows.length > 1 ? " passagers" : " passager")
    + " · " + used + (used > 1 ? " embarqués" : " embarqué");
  paxEl.replaceChildren(...rows.map((r) => {
    const li = el("li", "pax-row");
    const info = el("div", "pax-info");
    info.append(
      el("div", "ticket-name", r.passenger_name),
      el("div", "meta", (AGE[r.age_category] || "") + " · " + r.ticket_code),
      el("div", "meta", r.contact_name + " · " + r.booking_reference));
    const used1 = r.ticket_status === "USED";
    li.append(el("span", "seatnum", r.seat_number), info,
      el("span", "badge " + (used1 ? "ok" : "neutral"), used1 ? "Embarqué" : "À embarquer"));
    return li;
  }));
  if (!rows.length) paxSummaryEl.textContent = "Aucun billet émis pour ce départ.";
}

async function weigh(b, button) {
  const raw = prompt("Poids réel du bagage " + b.tag_code + " (en kg) :");
  if (raw === null) return;
  const w = parseNumber(raw);
  if (w === null || w < 0.1 || w > 100) {
    show("Saisissez un poids entre 0,1 et 100 kg.", "error");
    return;
  }
  button.disabled = true;
  const { data, error } = await supabase.rpc("weigh_luggage", { p_luggage_id: b.luggage_id, p_weight_kg: w });
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    button.disabled = false;
    return;
  }
  show("Bagage pesé. Supplément de ce bagage : " + fmtMoney(data) + ".", "");
  await loadAll();
}

function luggageItem(b) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(
    el("span", "agency", b.tag_code),
    el("span", "badge neutral", LUGGAGE_STATUS[b.status] || b.status));
  li.append(
    top,
    el("div", "meta", (LUGGAGE_TYPES[b.luggage_type] || b.luggage_type) + " · " + kg(b.weight_kg)),
    el("div", "meta", b.contact_name + " · " + b.booking_reference));
  if (b.description) li.append(el("div", "meta", b.description));
  if (Number(b.fee) > 0) li.append(el("div", "meta", "Supplément : " + fmtMoney(b.fee)));

  const acts = [];
  if (isStaff && (b.status === "DECLARED" || b.status === "WEIGHED")) {
    acts.push({ label: b.status === "DECLARED" ? "Peser" : "Corriger le poids", weigh: true });
  }
  if (b.status === "WEIGHED") acts.push({ label: "Charger", status: "LOADED" });
  if (b.status === "LOADED") acts.push({ label: "Décharger", status: "UNLOADED" });
  if (b.status === "UNLOADED") acts.push({ label: "Remettre au client", status: "DELIVERED" });
  if (isStaff && ["WEIGHED", "LOADED", "UNLOADED"].includes(b.status)) {
    acts.push({ label: "Déclarer perdu", status: "LOST", danger: true });
  }

  for (const a of acts) {
    const btn = el("button", "btn " + (a.danger ? "btn-danger" : "btn-secondary"), a.label);
    btn.type = "button";
    btn.addEventListener("click", async () => {
      if (a.weigh) return weigh(b, btn);
      if (a.danger && !confirm("Déclarer ce bagage perdu ? Cette action est définitive.")) return;
      await call(btn, supabase.rpc("set_luggage_status", { p_luggage_id: b.luggage_id, p_status: a.status }),
        "Bagage mis à jour.");
    });
    li.append(btn);
  }
  return li;
}

function shipmentItem(s) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(
    el("span", "agency", s.tracking_number),
    el("span", "badge neutral", SHIPMENT_STATUS[s.status] || s.status));
  li.append(
    top,
    el("div", "meta", (SHIPMENT_CATEGORIES[s.category] || s.category) + " · " + kg(s.weight_kg)),
    el("div", "meta", "Destinataire : " + s.receiver_name));
  const act = SHIP_ACTIONS[s.status];
  if (act) {
    const btn = el("button", "btn btn-secondary", act[1]);
    btn.type = "button";
    btn.addEventListener("click", async () => {
      await call(btn, supabase.rpc("set_shipment_status", { p_shipment_id: s.id, p_status: act[0] }),
        "Colis mis à jour.");
    });
    li.append(btn);
  }
  return li;
}

async function loadAll() {
  const [tripRes, paxRes, lugRes, shipRes] = await Promise.all([
    supabase.from("trips")
      .select("id, route_id, vehicle_id, departure_at, status, seats_total").eq("id", id).maybeSingle(),
    supabase.rpc("get_trip_manifest", { p_trip_id: id }),
    supabase.rpc("get_trip_luggage", { p_trip_id: id }),
    supabase.from("shipments")
      .select("id, tracking_number, receiver_name, category, weight_kg, status")
      .eq("trip_id", id).neq("status", "CANCELLED").order("created_at")
  ]);

  const failed = tripRes.error || paxRes.error || lugRes.error || shipRes.error;
  if (failed) {
    console.error(failed.code || failed.message);
    show(userMessage(failed, "Impossible de charger ce départ. Réessayez dans un instant."), "error");
    return false;
  }
  if (!tripRes.data) {
    show("Départ introuvable.", "error");
    return false;
  }
  try {
    trip = (await enrichTrips([tripRes.data]))[0];
  } catch (e) {
    console.error(e.code || e.message);
    show("Impossible de charger ce départ. Réessayez dans un instant.", "error");
    return false;
  }

  renderInfo();
  renderPassengers(paxRes.data || []);
  const bags = lugRes.data || [];
  lugEl.replaceChildren(...bags.map(luggageItem));
  if (!bags.length) lugEl.replaceChildren(el("li", "note", "Aucun bagage déclaré."));
  const ships = shipRes.data || [];
  shipEl.replaceChildren(...ships.map(shipmentItem));
  if (!ships.length) shipEl.replaceChildren(el("li", "note", "Aucun colis affecté à ce départ."));
  return true;
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT", "DRIVER"],
    id ? "manifest.html?id=" + id : "agency.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  if (!id) {
    show("Départ introuvable.", "error");
    return;
  }
  isStaff = ctx.profile.role !== "DRIVER";
  document.getElementById("back").href = isStaff ? "agency.html" : "driver.html";
  show("Chargement…", "");
  if (await loadAll()) show("", "");
}

init();

import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, userMessage } from "./ui.js";
import { requireRole } from "./pro.js";
import { SHIPMENT_CATEGORIES, SHIPMENT_STATUS, SHIPMENT_BADGE } from "./labels.js";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const countEl = document.getElementById("count");
const filterSel = document.getElementById("filter");
const searchIn = document.getElementById("search");
const codeBox = document.getElementById("code-box");

const TODO = ["CREATED", "DROPPED_AT_AGENCY", "ARRIVED", "READY_FOR_PICKUP"];
const CLOSED = ["DELIVERED", "RETURNED", "CANCELLED"];

let role = null;
let shipments = [];
let cityName = new Map();
let tripDate = new Map();
let upcoming = [];
let paidSet = new Set();

const show = (m, k) => showStatus(statusEl, m, k);
const kg = (n) => String(Number(n)).replace(".", ",") + " kg";

function button(label, cls, handler) {
  const b = el("button", "btn " + cls, label);
  b.type = "button";
  b.addEventListener("click", () => handler(b));
  return b;
}

async function run(b, request, okMessage) {
  b.disabled = true;
  const { error } = await request;
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    b.disabled = false;
    return;
  }
  show(okMessage, "");
  await load();
}

const setStatus = (id, status) =>
  supabase.rpc("set_shipment_status", { p_shipment_id: id, p_status: status, p_city_id: null, p_note: null });

function showCode(tracking, code) {
  const close = el("button", "btn btn-secondary", "Fermer");
  close.type = "button";
  close.addEventListener("click", () => {
    codeBox.hidden = true;
    codeBox.replaceChildren();
  });
  codeBox.replaceChildren(
    el("p", "ok-text", "Nouveau code de retrait du colis " + tracking),
    el("div", "ticket-code", code),
    el("p", "note", "Transmettez-le au destinataire. Il ne sera plus affiché."),
    close);
  codeBox.hidden = false;
  window.scrollTo(0, 0);
}

function assignBlock(s) {
  const key = s.origin_city_id + ">" + s.destination_city_id;
  const options = upcoming.filter((t) => t.key === key);
  const box = el("div", "inline-form");
  if (!options.length) {
    box.append(el("p", "note", "Aucun départ à venir sur cet itinéraire."));
    return box;
  }
  const sel = el("select");
  sel.setAttribute("aria-label", "Départ à affecter");
  sel.append(new Option("Choisir un départ", ""));
  for (const t of options) sel.append(new Option(fmtDate.format(new Date(t.departure_at)), t.id));
  if (s.trip_id) sel.value = s.trip_id;
  const b = button(s.trip_id ? "Changer de départ" : "Affecter à ce départ", "btn-secondary", async (btn) => {
    if (!sel.value) {
      show("Choisissez un départ.", "error");
      return;
    }
    await run(btn, supabase.rpc("assign_shipment_to_trip", { p_shipment_id: s.id, p_trip_id: sel.value }),
      "Colis affecté au départ.");
  });
  box.append(sel, b);
  return box;
}

function deliverBlock(s) {
  const box = el("div", "inline-form");
  const input = el("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.maxLength = 6;
  input.autocomplete = "off";
  input.placeholder = "Code de retrait (6 chiffres)";
  input.setAttribute("aria-label", "Code de retrait");
  const b = button("Remettre le colis", "", async (btn) => {
    const code = input.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      show("Le code de retrait comporte 6 chiffres.", "error");
      return;
    }
    btn.disabled = true;
    const { data, error } = await supabase.rpc("deliver_shipment", {
      p_tracking: s.tracking_number, p_code: code
    });
    if (error) {
      console.error(error.code || error.message);
      show(userMessage(error), "error");
      btn.disabled = false;
      return;
    }
    if (!data || data.ok !== true) {
      show((data && data.message) || "Livraison refusée.", "error");
      btn.disabled = false;
      input.value = "";
      return;
    }
    show("Colis remis à " + (data.receiver_name || "son destinataire") + ".", "");
    await load();
  });
  box.append(input, b);
  return box;
}

function historyBlock(s) {
  const holder = el("ul", "plain");
  holder.hidden = true;
  const b = button("Historique", "btn-secondary", async (btn) => {
    if (!holder.hidden) {
      holder.hidden = true;
      btn.textContent = "Historique";
      return;
    }
    btn.disabled = true;
    const { data, error } = await supabase.from("tracking_events")
      .select("status, city_id, note, event_at, is_public")
      .eq("shipment_id", s.id).order("event_at");
    btn.disabled = false;
    if (error) {
      console.error(error.code || error.message);
      show("Impossible de charger l'historique. Réessayez dans un instant.", "error");
      return;
    }
    holder.replaceChildren(...(data || []).map((e) => el("li", "meta",
      fmtDate.format(new Date(e.event_at)) + " · " + (SHIPMENT_STATUS[e.status] || e.status)
      + (e.city_id ? " · " + (cityName.get(e.city_id) || "") : "")
      + (e.note ? " · " + e.note : "")
      + (e.is_public ? "" : " (interne)"))));
    holder.hidden = false;
    btn.textContent = "Masquer l'historique";
  });
  return [b, holder];
}

function card(s) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(
    el("span", "agency", s.tracking_number),
    el("span", "badge " + (SHIPMENT_BADGE[s.status] || "neutral"), SHIPMENT_STATUS[s.status] || s.status));
  li.append(
    top,
    el("div", "route", (cityName.get(s.origin_city_id) || "?") + " → " + (cityName.get(s.destination_city_id) || "?")),
    el("div", "meta", (SHIPMENT_CATEGORIES[s.category] || s.category) + " · " + kg(s.weight_kg) + " · " + fmtMoney(s.price)),
    el("div", "meta", s.description),
    el("div", "meta", "Expéditeur : " + s.sender_name + " · " + s.sender_phone),
    el("div", "meta", "Destinataire : " + s.receiver_name + " · " + s.receiver_phone));
  if (s.declared_value) li.append(el("div", "meta", "Valeur déclarée : " + fmtMoney(s.declared_value)));
  if (s.trip_id && tripDate.has(s.trip_id)) {
    li.append(el("div", "meta", "Départ affecté : " + fmtDate.format(new Date(tripDate.get(s.trip_id)))));
  }

  const id = s.id;
  const closed = CLOSED.includes(s.status);

  if (paidSet.has(s.id)) {
    li.append(el("div", "ok-text", "✅ Payé"));
  } else if (!["CANCELLED", "RETURNED"].includes(s.status)) {
    li.append(button("Encaisser " + fmtMoney(s.price), "", async (b) => {
      if (!confirm("Confirmer l'encaissement de " + fmtMoney(s.price) + " en espèces ?")) return;
      await run(b, supabase.rpc("record_shipment_payment", { p_shipment_id: s.id }), "Paiement enregistré.");
    }));
  }

  if (s.status === "CREATED") {
    li.append(button("Réceptionner le colis", "", (b) =>
      run(b, setStatus(id, "DROPPED_AT_AGENCY"), "Colis réceptionné à l'agence.")));
  }
  if (s.status === "DROPPED_AT_AGENCY") {
    li.append(assignBlock(s));
    if (s.trip_id) {
      li.append(button("Charger le colis", "", (b) => run(b, setStatus(id, "LOADED"), "Colis chargé.")));
    }
  }
  if (s.status === "LOADED") {
    li.append(button("Colis en route", "", (b) => run(b, setStatus(id, "IN_TRANSIT"), "Colis en route.")));
  }
  if (s.status === "IN_TRANSIT") {
    li.append(button("Colis arrivé", "", (b) => run(b, setStatus(id, "ARRIVED"), "Colis arrivé.")));
  }
  if (s.status === "ARRIVED") {
    li.append(button("Marquer prêt au retrait", "", (b) =>
      run(b, setStatus(id, "READY_FOR_PICKUP"), "Colis prêt au retrait.")));
  }
  if (s.status === "READY_FOR_PICKUP") li.append(deliverBlock(s));

  if (s.status === "ARRIVED" || s.status === "READY_FOR_PICKUP") {
    li.append(button("Retourner à l'expéditeur", "btn-danger", async (b) => {
      if (!confirm("Retourner ce colis à l'expéditeur ?")) return;
      await run(b, setStatus(id, "RETURNED"), "Colis retourné à l'expéditeur.");
    }));
  }
  if (s.status === "CREATED" || s.status === "DROPPED_AT_AGENCY") {
    li.append(button("Annuler cet envoi", "btn-danger", async (b) => {
      if (!confirm("Annuler cet envoi ?")) return;
      await run(b, setStatus(id, "CANCELLED"), "Envoi annulé.");
    }));
  }
  if (role === "AGENCY_ADMIN" && !closed) {
    li.append(button("Nouveau code de retrait", "btn-secondary", async (b) => {
      if (!confirm("Générer un nouveau code ? L'ancien code ne fonctionnera plus.")) return;
      b.disabled = true;
      const { data, error } = await supabase.rpc("regenerate_pickup_code", { p_shipment_id: id });
      if (error) {
        console.error(error.code || error.message);
        show(userMessage(error), "error");
        b.disabled = false;
        return;
      }
      show("", "");
      showCode(s.tracking_number, data);
      await load();
    }));
  }
  li.append(...historyBlock(s));
  return li;
}

function matches(s) {
  const f = filterSel.value;
  if (f === "TODO" && !TODO.includes(s.status)) return false;
  if (f !== "ALL" && f !== "TODO" && s.status !== f) return false;
  const q = searchIn.value.trim().toLowerCase();
  if (!q) return true;
  return [s.tracking_number, s.receiver_name, s.receiver_phone, s.sender_name, s.sender_phone]
    .some((v) => String(v || "").toLowerCase().includes(q));
}

function render() {
  const rows = shipments.filter(matches);
  listEl.replaceChildren(...rows.map(card));
  countEl.textContent = rows.length + (rows.length > 1 ? " colis affichés" : " colis affiché")
    + " sur " + shipments.length + " chargés (100 maximum).";
}

async function load() {
  const nowIso = new Date().toISOString();
  const [ship, cities, routes, trips] = await Promise.all([
    supabase.from("shipments")
      .select("id, tracking_number, trip_id, sender_name, sender_phone, receiver_name, receiver_phone, origin_city_id, destination_city_id, category, description, weight_kg, declared_value, price, status, created_at")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("cities").select("id, name"),
    supabase.from("routes").select("id, origin_city_id, destination_city_id"),
    supabase.from("trips").select("id, route_id, departure_at")
      .in("status", ["SCHEDULED", "BOARDING"]).gt("departure_at", nowIso)
      .order("departure_at").limit(100)
  ]);
  const failed = ship.error || cities.error || routes.error || trips.error;
  if (failed) {
    console.error(failed.code || failed.message);
    show("Impossible de charger les colis. Réessayez dans un instant.", "error");
    return;
  }
  shipments = ship.data || [];
  cityName = new Map(cities.data.map((c) => [c.id, c.name]));
  const routeKey = new Map(routes.data.map((r) => [r.id, r.origin_city_id + ">" + r.destination_city_id]));
  upcoming = (trips.data || []).map((t) => ({
    id: t.id, departure_at: t.departure_at, key: routeKey.get(t.route_id)
  }));

  tripDate = new Map();
  const ids = [...new Set(shipments.map((s) => s.trip_id).filter(Boolean))];
  if (ids.length) {
    const r = await supabase.from("trips").select("id, departure_at").in("id", ids);
    if (!r.error) for (const t of r.data) tripDate.set(t.id, t.departure_at);
  }
  render();
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT"], "agency_shipments.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  role = ctx.profile.role;

  filterSel.append(new Option("À traiter", "TODO"), new Option("Tous les colis", "ALL"));
  for (const [v, t] of Object.entries(SHIPMENT_STATUS)) filterSel.append(new Option(t, v));
  filterSel.value = "TODO";
  filterSel.addEventListener("change", render);
  searchIn.addEventListener("input", render);

  show("Chargement…", "");
  await load();
  if (statusEl.textContent === "Chargement…") show("", "");
}

init();

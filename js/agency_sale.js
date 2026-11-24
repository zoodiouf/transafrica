import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, userMessage, UUID_RE } from "./ui.js";
import { requireRole, enrichTrips, field, input, select } from "./pro.js";
import { ticketList } from "./qr.js";

const MAX_SEATS = 10;
const AGE = [["ADULT", "Adulte"], ["CHILD", "Enfant"], ["INFANT", "Bébé"]];

const $ = (id) => document.getElementById(id);
const statusEl = $("status"), tripSel = $("trip"), stepTrip = $("step-trip"), stepSeats = $("step-seats");
const stepForm = $("step-form"), mapEl = $("seatmap"), summaryEl = $("summary"), toFormBtn = $("to-form");
const form = $("sale-form"), paxEl = $("passengers"), totalEl = $("total"), submitBtn = $("submit-btn");
const backBtn = $("back-btn"), doneEl = $("done");

let trips = [];
let tripId = null;
let price = 0;
let seats = [];
let selected = [];

const show = (m, k) => showStatus(statusEl, m, k);
const seatById = (id) => seats.find((s) => s.seat_id === id);

function updateSummary() {
  if (!selected.length) {
    summaryEl.textContent = "Touchez un siège libre pour le choisir (" + MAX_SEATS + " maximum).";
    toFormBtn.disabled = true;
    return;
  }
  const numbers = selected.map(seatById).filter(Boolean).map((s) => s.seat_number);
  summaryEl.textContent = "Sièges : " + numbers.join(", ") + " · Total : " + fmtMoney(price * selected.length);
  toFormBtn.disabled = false;
}

function toggle(id) {
  if (selected.includes(id)) {
    selected = selected.filter((x) => x !== id);
    show("", "");
  } else if (selected.length >= MAX_SEATS) {
    show("Vous pouvez vendre " + MAX_SEATS + " places au maximum à la fois.", "error");
    return;
  } else {
    selected.push(id);
    show("", "");
  }
  renderSeats();
}

function renderSeats() {
  mapEl.replaceChildren();
  if (seats.length) mapEl.style.setProperty("--cols", String(Math.max(...seats.map((s) => s.col_index)) + 1));
  for (const s of seats) {
    const b = el("button", "seat", s.seat_number);
    b.type = "button";
    b.style.gridRow = String(s.row_index + 1);
    b.style.gridColumn = String(s.col_index + 1);
    if (!s.is_available) {
      b.disabled = true;
      b.classList.add("taken");
      b.setAttribute("aria-label", "Siège " + s.seat_number + ", occupé");
    } else {
      const picked = selected.includes(s.seat_id);
      if (picked) b.classList.add("picked");
      b.setAttribute("aria-pressed", String(picked));
      b.setAttribute("aria-label", "Siège " + s.seat_number + (picked ? ", choisi" : ", libre"));
      b.addEventListener("click", () => toggle(s.seat_id));
    }
    mapEl.append(b);
  }
  updateSummary();
}

async function loadSeats() {
  const { data, error } = await supabase.rpc("get_trip_seats", { p_trip_id: tripId });
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger le plan des sièges. Réessayez dans un instant.", "error");
    return false;
  }
  seats = data || [];
  selected = selected.filter((id) => seats.some((s) => s.seat_id === id && s.is_available));
  renderSeats();
  return true;
}

tripSel.addEventListener("change", async () => {
  tripId = tripSel.value || null;
  selected = [];
  stepForm.hidden = true;
  show("", "");
  if (!tripId) {
    stepSeats.hidden = true;
    return;
  }
  price = Number((trips.find((t) => t.id === tripId) || {}).price) || 0;
  if (await loadSeats()) {
    stepSeats.hidden = false;
    if (!seats.some((s) => s.is_available)) show("Ce départ est complet.", "error");
  }
});

function buildPassengers() {
  paxEl.replaceChildren();
  selected.forEach((sid, i) => {
    const seat = seatById(sid);
    const box = el("fieldset", "pax");
    box.append(el("legend", "", "Passager " + (i + 1) + " · siège " + (seat ? seat.seat_number : "")));
    const name = input("text", { max: 100 });
    name.id = "pname-" + i;
    const age = select(AGE);
    age.id = "page-" + i;
    box.append(field("Nom complet", name), field("Catégorie", age));
    paxEl.append(box);
  });
  totalEl.textContent = "À encaisser : " + fmtMoney(price * selected.length) + " en espèces";
}

toFormBtn.addEventListener("click", () => {
  show("", "");
  buildPassengers();
  stepSeats.hidden = true;
  stepForm.hidden = false;
  window.scrollTo(0, 0);
});

backBtn.addEventListener("click", () => {
  stepForm.hidden = true;
  stepSeats.hidden = false;
  show("", "");
});

async function renderDone(r) {
  stepTrip.hidden = true;
  stepSeats.hidden = true;
  stepForm.hidden = true;
  doneEl.hidden = false;
  doneEl.replaceChildren(
    el("p", "ok-text", "Vente enregistrée."),
    el("div", "meta", "Réservation " + r.reference),
    el("div", "price-line", "Encaissé : " + fmtMoney(r.total_amount) + " en espèces"));

  const { data, error } = await supabase.rpc("get_counter_tickets", { p_booking_id: r.booking_id });
  if (error) {
    console.error(error.code || error.message);
    doneEl.append(el("p", "note", "Les billets n'ont pas pu être affichés : retrouvez-les dans « Réservations »."));
  } else {
    doneEl.append(await ticketList(data || []));
    doneEl.append(el("p", "note", "Présentez les QR codes ci-dessus au client, ou donnez-lui les codes écrits en dessous."));
  }
  const again = el("a", "btn btn-link", "Nouvelle vente");
  again.href = "agency_sale.html";
  const list = el("a", "btn btn-secondary btn-link", "Voir les réservations");
  list.href = "agency_bookings.html";
  doneEl.append(again, list);
  window.scrollTo(0, 0);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const passengers = [];
  for (let i = 0; i < selected.length; i++) {
    const name = $("pname-" + i).value.trim();
    if (name.length < 2 || name.length > 100) {
      show("Saisissez le nom de chaque passager (2 à 100 caractères).", "error");
      return;
    }
    passengers.push({ full_name: name, age_category: $("page-" + i).value });
  }
  const cName = $("c-name").value.trim() || passengers[0].full_name;
  const cPhone = $("c-phone").value.trim();
  if (!/^\+?[0-9 ]{8,20}$/.test(cPhone)) {
    show("Saisissez un téléphone valide, par exemple +221 77 000 00 00.", "error");
    return;
  }
  if (!confirm("Encaisser " + fmtMoney(price * selected.length) + " en espèces et émettre les billets ?")) return;

  submitBtn.disabled = true;
  show("Enregistrement de la vente…", "");
  const { data, error } = await supabase.rpc("create_counter_booking", {
    p_trip_id: tripId, p_seat_ids: selected, p_passengers: passengers,
    p_contact_name: cName, p_contact_phone: cPhone
  });
  if (error) {
    console.error(error.code || error.message);
    const message = userMessage(error);
    await loadSeats();
    stepForm.hidden = true;
    stepSeats.hidden = false;
    show(message, "error");
    submitBtn.disabled = false;
    return;
  }
  if (!data || !UUID_RE.test(data.booking_id || "")) {
    show("Vente enregistrée. Retrouvez-la dans « Réservations ».", "");
    submitBtn.disabled = false;
    return;
  }
  show("", "");
  await renderDone(data);
});

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT"], "agency_sale.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    stepTrip.hidden = true;
    return;
  }
  show("Chargement…", "");
  const { data, error } = await supabase.from("trips")
    .select("id, route_id, vehicle_id, departure_at, price, status, seats_total")
    .in("status", ["SCHEDULED", "BOARDING"]).gt("departure_at", new Date().toISOString())
    .order("departure_at").limit(30);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  try {
    trips = await enrichTrips(data || []);
  } catch (e) {
    console.error(e.code || e.message);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  for (const t of trips) {
    tripSel.append(new Option(
      t.origin + " → " + t.destination + " · " + fmtDate.format(new Date(t.departure_at)) + " · " + fmtMoney(t.price), t.id));
  }
  show(trips.length ? "" : "Aucun départ à venir : créez-en un dans « Départs ».", "");
}

init();

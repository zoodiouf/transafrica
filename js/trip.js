import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtTime, fmtMoney, paramId, userMessage, UUID_RE } from "./ui.js";

const MAX_SEATS = 6;
const AGE_LABELS = { ADULT: "Adulte", CHILD: "Enfant", INFANT: "Bébé" };

const statusEl = document.getElementById("status");
const infoEl = document.getElementById("trip-info");
const stepSeats = document.getElementById("step-seats");
const stepForm = document.getElementById("step-form");
const mapEl = document.getElementById("seatmap");
const summaryEl = document.getElementById("summary");
const toFormBtn = document.getElementById("to-form");
const form = document.getElementById("booking-form");
const passengersEl = document.getElementById("passengers");
const submitBtn = document.getElementById("submit-btn");
const backBtn = document.getElementById("back-btn");

const tripId = paramId();
let trip = null;
let seats = [];
let selected = [];

const show = (m, k) => showStatus(statusEl, m, k);

function renderInfo() {
  const rows = [
    el("div", "agency", trip.agency_name),
    el("div", "route", trip.origin_city + " → " + trip.destination_city),
    el("div", "meta", "Départ : " + fmtDate.format(new Date(trip.departure_at)))
  ];
  if (trip.arrival_estimated_at) {
    rows.push(el("div", "meta", "Arrivée estimée vers " + fmtTime.format(new Date(trip.arrival_estimated_at))));
  }
  rows.push(el("div", "meta", "Prix par siège : " + fmtMoney(trip.price)));
  rows.push(el("div", "meta", "Bagage gratuit : " + trip.free_luggage_kg + " kg par billet"
    + (Number(trip.extra_kg_price) > 0 ? " · excédent " + fmtMoney(trip.extra_kg_price) + "/kg" : "")));
  infoEl.replaceChildren(...rows);
  infoEl.hidden = false;
}

function seatById(id) {
  return seats.find((s) => s.seat_id === id);
}

function updateSummary() {
  if (!selected.length) {
    summaryEl.textContent = "Touchez un siège libre pour le choisir (" + MAX_SEATS + " maximum).";
    toFormBtn.disabled = true;
    return;
  }
  const numbers = selected.map(seatById).filter(Boolean).map((s) => s.seat_number);
  summaryEl.textContent = "Sièges : " + numbers.join(", ") + " · Total : "
    + fmtMoney(Number(trip.price) * selected.length);
  toFormBtn.disabled = false;
}

function toggle(id) {
  if (selected.includes(id)) {
    selected = selected.filter((x) => x !== id);
    show("", "");
  } else if (selected.length >= MAX_SEATS) {
    show("Vous pouvez réserver " + MAX_SEATS + " places au maximum à la fois.", "error");
    return;
  } else {
    selected.push(id);
    show("", "");
  }
  renderSeats();
}

function renderSeats() {
  mapEl.replaceChildren();
  if (seats.length) {
    const cols = Math.max(...seats.map((s) => s.col_index)) + 1;
    mapEl.style.setProperty("--cols", String(cols));
  }
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

function buildPassengers() {
  passengersEl.replaceChildren();
  selected.forEach((sid, i) => {
    const seat = seatById(sid);
    const box = el("fieldset", "pax");
    box.append(el("legend", "", "Passager " + (i + 1) + " · siège " + (seat ? seat.seat_number : "")));

    const f1 = el("div", "field");
    const l1 = el("label", "", "Nom complet");
    l1.htmlFor = "pname-" + i;
    const in1 = el("input");
    in1.id = "pname-" + i;
    in1.type = "text";
    in1.maxLength = 100;
    in1.autocomplete = "off";
    f1.append(l1, in1);

    const f2 = el("div", "field");
    const l2 = el("label", "", "Catégorie");
    l2.htmlFor = "page-" + i;
    const sel = el("select");
    sel.id = "page-" + i;
    for (const [v, t] of Object.entries(AGE_LABELS)) sel.append(new Option(t, v));
    f2.append(l2, sel);

    box.append(f1, f2);
    passengersEl.append(box);
  });
}

async function prefill(userId) {
  const { data: p } = await supabase
    .from("profiles").select("full_name, phone, email").eq("id", userId).maybeSingle();
  if (!p) return;
  const n = document.getElementById("c-name");
  const ph = document.getElementById("c-phone");
  const em = document.getElementById("c-email");
  if (!n.value) n.value = p.full_name || "";
  if (!ph.value) ph.value = p.phone || "";
  if (!em.value) em.value = p.email || "";
  const first = document.getElementById("pname-0");
  if (first && !first.value) first.value = p.full_name || "";
}

toFormBtn.addEventListener("click", async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.href = "login.html?next=" + encodeURIComponent("trip.html?id=" + tripId);
    return;
  }
  show("", "");
  buildPassengers();
  await prefill(data.session.user.id);
  stepSeats.hidden = true;
  stepForm.hidden = false;
  window.scrollTo(0, 0);
});

backBtn.addEventListener("click", () => {
  stepForm.hidden = true;
  stepSeats.hidden = false;
  show("", "");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const contactName = document.getElementById("c-name").value.trim();
  const contactPhone = document.getElementById("c-phone").value.trim();
  const contactEmail = document.getElementById("c-email").value.trim();

  const passengers = [];
  for (let i = 0; i < selected.length; i++) {
    const name = document.getElementById("pname-" + i).value.trim();
    if (name.length < 2 || name.length > 100) {
      show("Saisissez le nom de chaque passager (2 à 100 caractères).", "error");
      return;
    }
    passengers.push({ full_name: name, age_category: document.getElementById("page-" + i).value });
  }
  if (contactName.length < 2) {
    show("Saisissez le nom du contact.", "error");
    return;
  }
  if (!/^\+?[0-9 ]{8,20}$/.test(contactPhone)) {
    show("Saisissez un téléphone valide, par exemple +221 77 000 00 00.", "error");
    return;
  }
  if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    show("L'adresse e-mail du contact n'est pas valide.", "error");
    return;
  }

  submitBtn.disabled = true;
  show("Réservation en cours…", "");
  const { data, error } = await supabase.rpc("create_booking", {
    p_trip_id: tripId,
    p_seat_ids: selected,
    p_passengers: passengers,
    p_contact_name: contactName,
    p_contact_phone: contactPhone,
    p_contact_email: contactEmail || null
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
  if (typeof data === "string" && UUID_RE.test(data)) {
    location.href = "booking.html?id=" + data;
    return;
  }
  show("Réservation créée. Retrouvez-la dans « Réservations ».", "");
  submitBtn.disabled = false;
});

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  if (!tripId) {
    show("Départ introuvable. Retournez à la recherche.", "error");
    return;
  }
  show("Chargement…", "");
  const { data, error } = await supabase
    .from("trips_public")
    .select("id, agency_name, origin_city, destination_city, departure_at, arrival_estimated_at, price, free_luggage_kg, extra_kg_price")
    .eq("id", tripId).maybeSingle();
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger ce départ. Réessayez dans un instant.", "error");
    return;
  }
  if (!data) {
    show("Ce départ n'est plus disponible.", "error");
    return;
  }
  trip = data;
  renderInfo();
  show("", "");
  if (await loadSeats()) {
    stepSeats.hidden = false;
    if (!seats.some((s) => s.is_available)) show("Ce départ est complet.", "error");
  }
}

init();

import { supabase } from "./supabase.js";

const form = document.getElementById("search-form");
const originSel = document.getElementById("origin");
const destSel = document.getElementById("destination");
const dateInput = document.getElementById("date");
const searchBtn = document.getElementById("search-btn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const fmtDeparture = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar", weekday: "short", day: "2-digit", month: "short",
  hour: "2-digit", minute: "2-digit"
});
const fmtTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar", hour: "2-digit", minute: "2-digit"
});
const fmtPrice = new Intl.NumberFormat("fr-FR");

function show(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
  statusEl.hidden = !message;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function fillCities(select, cities) {
  select.replaceChildren(new Option("Toutes les villes", ""));
  for (const c of cities) select.append(new Option(c.name, c.id));
}

function seatsBadge(n) {
  if (n <= 0) return el("span", "badge full", "Complet");
  if (n <= 3) return el("span", "badge low", "Plus que " + n + (n > 1 ? " places" : " place"));
  return el("span", "badge ok", n + " places libres");
}

function tripCard(t) {
  const li = el("li", "trip");

  const top = el("div", "trip-top");
  const agency = el("div", "agency");
  if (typeof t.logo_url === "string" && t.logo_url.startsWith("https://")) {
    const img = el("img");
    img.src = t.logo_url;
    img.alt = "";
    img.loading = "lazy";
    agency.append(img);
  }
  agency.append(el("span", "", t.agency_name));
  top.append(agency, el("span", "price", fmtPrice.format(Number(t.price)) + " FCFA"));

  const route = el("div", "route", t.origin_city + " → " + t.destination_city);
  const dep = el("div", "meta", "Départ : " + fmtDeparture.format(new Date(t.departure_at)));
  li.append(top, route, dep);

  if (t.arrival_estimated_at) {
    li.append(el("div", "meta", "Arrivée estimée vers " + fmtTime.format(new Date(t.arrival_estimated_at))));
  }
  li.append(el("div", "meta", "Bagage gratuit : " + t.free_luggage_kg + " kg par billet"));
  li.append(seatsBadge(Number(t.seats_free)));
  return li;
}

function render(trips) {
  resultsEl.replaceChildren();
  if (!trips.length) {
    show("Aucun départ trouvé pour ces critères.", "");
    return;
  }
  show(trips.length + (trips.length > 1 ? " départs trouvés" : " départ trouvé"), "");
  for (const t of trips) resultsEl.append(tripCard(t));
}

async function search() {
  const origin = originSel.value || null;
  const destination = destSel.value || null;
  if (origin && destination && origin === destination) {
    show("Le départ et l'arrivée doivent être différents.", "error");
    return;
  }
  searchBtn.disabled = true;
  show("Recherche en cours…", "");
  const { data, error } = await supabase.rpc("search_trips", {
    p_origin_city: origin,
    p_destination_city: destination,
    p_date: dateInput.value || null
  });
  searchBtn.disabled = false;
  if (error) {
    console.error(error);
    show("Impossible de charger les départs. Réessayez dans un instant.", "error");
    return;
  }
  render(data || []);
}

async function init() {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (supabase) search();
  });

  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }

  dateInput.min = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dakar" });

  const { data, error } = await supabase
    .from("cities").select("id, name").eq("is_active", true).order("name");
  if (error) {
    console.error(error);
    show("Impossible de charger les villes. Réessayez dans un instant.", "error");
    return;
  }
  fillCities(originSel, data);
  fillCities(destSel, data);
  await search();
}

init();

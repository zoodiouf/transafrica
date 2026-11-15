import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, paramId, userMessage, requireSession } from "./ui.js";

const statusEl = document.getElementById("status");
const content = document.getElementById("content");
const id = paramId();
const AGE = { ADULT: "Adulte", CHILD: "Enfant", INFANT: "Bébé" };

let timer = null;
let memKey = null;

const show = (m, k) => showStatus(statusEl, m, k);

function randomId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

function payKey() {
  try {
    let v = sessionStorage.getItem("payKey:" + id);
    if (!v) {
      v = "pay-" + randomId();
      sessionStorage.setItem("payKey:" + id, v);
    }
    return v;
  } catch (e) {
    if (!memKey) memKey = "pay-" + randomId();
    return memKey;
  }
}

function resetKey() {
  memKey = null;
  try { sessionStorage.removeItem("payKey:" + id); } catch (e) { /* ignoré */ }
}

function linkTo(href, text, cls) {
  const a = el("a", cls || "", text);
  a.href = href;
  return a;
}

function summaryCard(b, seats) {
  const card = el("div", "card trip-info");
  card.append(
    el("div", "agency", "Réservation " + b.reference),
    el("div", "route", b.origin_city + " → " + b.destination_city),
    el("div", "meta", b.agency_name + " · départ " + fmtDate.format(new Date(b.departure_at))),
    el("div", "price-line", "Total : " + fmtMoney(b.total_amount))
  );
  if (seats.length) {
    const ul = el("ul", "plain");
    for (const s of seats) {
      ul.append(el("li", "", "Siège " + s.seat_number + " · " + s.passenger_name
        + " (" + (AGE[s.age_category] || "") + ")"));
    }
    card.append(ul);
  }
  return card;
}

function pendingBlock(b) {
  const offset = new Date(b.server_now).getTime() - Date.now();
  const box = el("div", "card stack");
  const cd = el("div", "countdown");
  cd.setAttribute("role", "timer");
  const hint = el("p", "note", "Temps restant pour payer. Passé ce délai, vos places sont libérées.");
  const payBtn = el("button", "btn", "Payer " + fmtMoney(b.total_amount) + " (simulation)");
  const failBtn = el("button", "btn btn-secondary", "Simuler un paiement refusé (test)");
  const cancelBtn = el("button", "btn btn-danger", "Annuler la réservation");
  for (const x of [payBtn, failBtn, cancelBtn]) x.type = "button";
  box.append(cd, hint, payBtn, failBtn, cancelBtn);

  const buttons = [payBtn, failBtn, cancelBtn];
  const lock = (v) => buttons.forEach((x) => { x.disabled = v; });

  function tick() {
    const ms = new Date(b.expires_at).getTime() - (Date.now() + offset);
    if (ms <= 0) {
      clearInterval(timer);
      load();
      return;
    }
    const s = Math.floor(ms / 1000);
    cd.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    cd.classList.toggle("low", s < 60);
  }
  tick();
  timer = setInterval(tick, 1000);

  async function pay(outcome) {
    lock(true);
    show("Paiement en cours…", "");
    const { data: pid, error } = await supabase.rpc("pay_booking_simulated", {
      p_booking_id: id,
      p_idempotency_key: payKey(),
      p_outcome: outcome
    });
    if (error) {
      console.error(error.code || error.message);
      show(userMessage(error), "error");
      await load();
      return;
    }
    const { data: pay } = await supabase.from("payments").select("status").eq("id", pid).maybeSingle();
    if (pay && pay.status === "SUCCEEDED") {
      resetKey();
      location.href = "tickets.html?id=" + id;
      return;
    }
    resetKey();
    show("Le paiement a été refusé. Vous pouvez réessayer.", "error");
    lock(false);
  }

  payBtn.addEventListener("click", () => pay("SUCCESS"));
  failBtn.addEventListener("click", () => pay("FAILED"));
  cancelBtn.addEventListener("click", async () => {
    if (!confirm("Annuler cette réservation ? Vos places seront libérées.")) return;
    lock(true);
    const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id, p_reason: null });
    if (error) {
      console.error(error.code || error.message);
      show(userMessage(error), "error");
      await load();
      return;
    }
    location.href = "bookings.html";
  });
  return box;
}

function infoBlock(text, cls, links) {
  const box = el("div", "card stack");
  box.append(el("p", cls || "", text));
  for (const l of links || []) box.append(l);
  return box;
}

function render(b, seats) {
  clearInterval(timer);
  content.replaceChildren(summaryCard(b, seats));
  const expired = b.status === "PENDING" && new Date(b.expires_at) <= new Date(b.server_now);

  if (b.status === "PENDING" && !expired) {
    content.append(pendingBlock(b));
  } else if (b.status === "EXPIRED" || expired) {
    content.append(infoBlock("Cette réservation a expiré. Vos places ont été libérées.", "",
      [linkTo("index.html", "Rechercher un autre départ", "btn btn-link")]));
  } else if (b.status === "CONFIRMED") {
        content.append(infoBlock("Réservation confirmée. Vos billets sont prêts.", "ok-text",
      [linkTo("tickets.html?id=" + id, "Voir mes billets", "btn btn-link"),
       linkTo("luggage.html?id=" + id, "Déclarer mes bagages", "btn btn-secondary btn-link")]));
  } else if (b.status === "CANCELLED") {
    content.append(infoBlock("Cette réservation est annulée.", "", []));
  } else {
    content.append(infoBlock("Statut : " + b.status, "", []));
  }
}

async function load() {
  clearInterval(timer);
  const { data, error } = await supabase.rpc("get_my_bookings");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger la réservation. Réessayez dans un instant.", "error");
    return;
  }
  const b = (data || []).find((x) => x.booking_id === id);
  if (!b) {
    show("Réservation introuvable.", "error");
    content.replaceChildren();
    return;
  }
  const { data: seats } = await supabase.rpc("get_booking_seats", { p_booking_id: id });
  render(b, seats || []);
}

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  if (!id) {
    show("Réservation introuvable.", "error");
    return;
  }
  const session = await requireSession(supabase, "booking.html?id=" + id);
  if (!session) return;
  await load();
}

init();

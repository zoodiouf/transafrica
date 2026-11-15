import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, paramId, requireSession } from "./ui.js";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const warnEl = document.getElementById("warn");
const id = paramId();

const LABELS = { VALID: "Valide", USED: "Utilisé", CANCELLED: "Annulé", EXPIRED: "Expiré" };
const BADGES = { VALID: "ok", USED: "neutral", CANCELLED: "full", EXPIRED: "full" };

let qrFactory = null;
const show = (m, k) => showStatus(statusEl, m, k);

async function loadQrLibrary() {
  try {
    const m = await import("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm");
    qrFactory = m.default || m;
  } catch (e) {
    console.error("QR indisponible", e);
  }
}

function drawQr(canvas, text) {
  const qr = qrFactory(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const scale = 6;
  const margin = 4;
  const size = (n + margin * 2) * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    }
  }
}

function card(t) {
  const li = el("li", "ticket");
  li.append(
    el("span", "badge " + (BADGES[t.status] || "neutral"), LABELS[t.status] || t.status),
    el("div", "route", t.origin_city + " → " + t.destination_city),
    el("div", "meta", t.agency_name + " · " + fmtDate.format(new Date(t.departure_at))),
    el("div", "ticket-name", t.passenger_name + " · siège " + t.seat_number)
  );

  if (t.status === "VALID") {
    if (qrFactory) {
      const canvas = el("canvas", "qr");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "QR code du billet " + t.ticket_code);
      try {
        drawQr(canvas, t.qr_token);
        li.append(canvas);
      } catch (e) {
        console.error(e);
      }
    } else {
      li.append(el("p", "note", "QR code indisponible : présentez le code ci-dessous."));
    }
  } else if (t.status === "USED") {
    li.append(el("p", "note", "Ce billet a déjà été utilisé."));
  } else {
    li.append(el("p", "note", "Ce billet n'est plus utilisable."));
  }
  li.append(el("div", "ticket-code", t.ticket_code), el("div", "meta", "Réservation " + t.booking_reference));
  return li;
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
  const session = await requireSession(supabase, "tickets.html?id=" + id);
  if (!session) return;

  show("Chargement…", "");
  const { data, error } = await supabase.rpc("get_my_tickets", { p_booking_id: id });
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger vos billets. Réessayez dans un instant.", "error");
    return;
  }
  if (!data || !data.length) {
    show("Aucun billet pour cette réservation. Elle est peut-être en attente de paiement.", "");
    return;
  }
  show("", "");
  await loadQrLibrary();
  listEl.replaceChildren(...data.map(card));
    warnEl.hidden = false;
  const lug = el("a", "btn btn-secondary btn-link", "Déclarer mes bagages");
  lug.href = "luggage.html?id=" + id;
  warnEl.after(lug);
}

init();

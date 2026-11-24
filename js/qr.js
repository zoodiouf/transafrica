import { el, fmtDate } from "./ui.js";

const LABELS = { VALID: "Valide", USED: "Utilisé", CANCELLED: "Annulé", EXPIRED: "Expiré" };
let factory = null;

export async function loadQr() {
  if (factory) return true;
  try {
    const m = await import("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm");
    factory = m.default || m;
    return true;
  } catch (e) {
    console.error("QR indisponible", e);
    return false;
  }
}

export function drawQr(canvas, text) {
  const qr = factory(0, "M");
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

export async function ticketList(tickets) {
  const ready = await loadQr();
  const ul = el("ul", "plain tickets");
  for (const t of tickets) {
    const li = el("li", "ticket");
    li.append(
      el("span", "badge " + (t.status === "VALID" ? "ok" : "neutral"), LABELS[t.status] || t.status),
      el("div", "route", t.origin_city + " → " + t.destination_city),
      el("div", "meta", t.agency_name + " · " + fmtDate.format(new Date(t.departure_at))),
      el("div", "ticket-name", t.passenger_name + " · siège " + t.seat_number));
    if (t.status === "VALID" && ready) {
      const canvas = el("canvas", "qr");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "QR code du billet " + t.ticket_code);
      try {
        drawQr(canvas, t.qr_token);
        li.append(canvas);
      } catch (e) {
        console.error(e);
      }
    } else if (t.status === "VALID") {
      li.append(el("p", "note", "QR code indisponible : présentez le code ci-dessous."));
    }
    li.append(el("div", "ticket-code", t.ticket_code), el("div", "meta", "Réservation " + t.booking_reference));
    ul.append(li);
  }
  return ul;
}

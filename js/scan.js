import { supabase } from "./supabase.js";
import { el, showStatus, userMessage, fmtTime } from "./ui.js";
import { requireRole } from "./pro.js";

const form = document.getElementById("scan-form");
const input = document.getElementById("code");
const btn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const show = (m, k) => showStatus(statusEl, m, k);

const history = [];

function renderResult(r) {
  const ok = r.ok === true;
  const box = el("div", "scan-result " + (ok ? "ok" : "ko"));
  box.append(
    el("div", "scan-icon", ok ? "✅" : "❌"),
    el("div", "scan-msg", r.message || (ok ? "Billet validé" : "Billet refusé")));
  if (r.passenger_name) box.append(el("div", "ticket-name", r.passenger_name));
  if (r.seat_number) box.append(el("div", "meta", "Siège " + r.seat_number));
  if (r.ticket_code) box.append(el("div", "ticket-code", r.ticket_code));
  resultEl.replaceChildren(box);
  resultEl.hidden = false;
}

function pushHistory(r) {
  const ok = r.ok === true;
  const text = fmtTime.format(new Date()) + " · " + (ok ? "✅ " : "❌ ")
    + (r.passenger_name ? r.passenger_name + (r.seat_number ? " (siège " + r.seat_number + ")" : "") : (r.message || ""));
  history.unshift(text);
  if (history.length > 8) history.pop();
  historyEl.replaceChildren(...history.map((t) => el("li", "meta", t)));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (value.length < 6 || value.length > 100) {
    show("Saisissez le code du billet (de la forme TK-XXXXXXXXXX).", "error");
    return;
  }
  btn.disabled = true;
  show("Vérification…", "");
  const { data, error } = await supabase.rpc("validate_ticket", { p_input: value });
  btn.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    return;
  }
  show("", "");
  renderResult(data || {});
  pushHistory(data || {});
  input.value = "";
  input.focus();
});

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN", "AGENCY_AGENT", "DRIVER"], "scan.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    form.hidden = true;
  }
}

init();

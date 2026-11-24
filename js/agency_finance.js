import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate, fmtMoney, userMessage } from "./ui.js";
import { requireRole, btn } from "./pro.js";

const PAYOUT = { REQUESTED: "Demandé", APPROVED: "Approuvé", PAID: "Payé", REJECTED: "Refusé" };
const BADGE = { REQUESTED: "low", APPROVED: "low", PAID: "ok", REJECTED: "full" };

const statusEl = document.getElementById("status");
const balanceEl = document.getElementById("balance");
const requestBox = document.getElementById("request-box");
const historyEl = document.getElementById("history");
const dayIn = document.getElementById("day");
const cashEl = document.getElementById("cash");
const show = (m, k) => showStatus(statusEl, m, k);

function tile(label, value) {
  const d = el("div", "stat");
  d.append(el("div", "stat-value", value), el("div", "stat-label", label));
  return d;
}

function payoutCard(p) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", fmtMoney(p.net_amount)),
    el("span", "badge " + (BADGE[p.status] || "neutral"), PAYOUT[p.status] || p.status));
  li.append(top,
    el("div", "meta", "Demandé le " + fmtDate.format(new Date(p.created_at))),
    el("div", "meta", "Ventes " + fmtMoney(p.total_gross) + " · commissions " + fmtMoney(p.total_commission)));
  if (p.status === "PAID") li.append(el("div", "meta", "Payé par " + (p.method || "") + " · référence " + (p.reference || "")));
  if (p.notes) li.append(el("div", "meta", "Note : " + p.notes));
  return li;
}

async function loadHistory() {
  const { data, error } = await supabase.from("payouts")
    .select("id, status, net_amount, total_gross, total_commission, method, reference, created_at, notes")
    .order("created_at", { ascending: false }).limit(20);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les reversements. Réessayez dans un instant.", "error");
    return null;
  }
  historyEl.replaceChildren(...(data || []).map(payoutCard));
  if (!data || !data.length) historyEl.replaceChildren(el("li", "note", "Aucun reversement pour le moment."));
  return (data || []).some((p) => p.status === "REQUESTED" || p.status === "APPROVED");
}

async function loadBalance(hasOpenPayout) {
  const { data, error } = await supabase.rpc("get_agency_balance");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger le solde. Réessayez dans un instant.", "error");
    return;
  }
  const b = (data || [])[0] || {};
  const n = (k) => Number(b[k]) || 0;
  balanceEl.replaceChildren(
    tile("Solde total", fmtMoney(n("balance"))),
    tile("Reversable maintenant", fmtMoney(n("eligible_balance"))),
    tile("Ventes en ligne nettes", fmtMoney(n("online_net"))),
    tile("Commissions dues (guichet)", fmtMoney(n("cash_commission"))));

  requestBox.replaceChildren();
  if (hasOpenPayout) {
    requestBox.append(el("p", "note", "Une demande de reversement est en cours de traitement."));
    return;
  }
  const amount = n("eligible_balance");
  const request = btn("Demander le reversement de " + fmtMoney(amount), "", async (button) => {
    if (!confirm("Demander le reversement de " + fmtMoney(amount) + " ?")) return;
    button.disabled = true;
    const res = await supabase.rpc("request_payout");
    if (res.error) {
      console.error(res.error.code || res.error.message);
      show(userMessage(res.error), "error");
      button.disabled = false;
      return;
    }
    show("Demande de reversement envoyée.", "");
    await refresh();
  });
  request.disabled = amount <= 0;
  requestBox.append(request);
  if (amount <= 0) requestBox.append(el("p", "note", "Rien à reverser pour le moment."));
}

async function loadCash() {
  const { data, error } = await supabase.rpc("get_cash_report", { p_day: dayIn.value || null });
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger la caisse. Réessayez dans un instant.", "error");
    return;
  }
  cashEl.replaceChildren(...(data || []).map((r) => {
    const li = el("li", "trip");
    li.append(el("div", "agency", r.agent_name),
      el("div", "meta", r.payments_count + " encaissement(s) · encaissé " + fmtMoney(r.cash_in)
        + " · remboursé " + fmtMoney(r.refunds_out)),
      el("div", "price-line", "Net en caisse : " + fmtMoney(r.net_cash)));
    return li;
  }));
  if (!data || !data.length) cashEl.replaceChildren(el("li", "note", "Aucun mouvement d'espèces ce jour-là."));
}

async function refresh() {
  const open = await loadHistory();
  if (open === null) return;
  await loadBalance(open);
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_finance.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  dayIn.value = new Date().toISOString().slice(0, 10);
  dayIn.addEventListener("change", loadCash);
  show("Chargement…", "");
  await Promise.all([refresh(), loadCash()]);
  if (statusEl.textContent === "Chargement…") show("", "");
}

init();

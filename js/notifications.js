import { supabase } from "./supabase.js";

const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const markAllBtn = document.getElementById("mark-all");

const fmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar", day: "2-digit", month: "short",
  hour: "2-digit", minute: "2-digit"
});
const TYPES = {
  BOOKING: "Réservation", PAYMENT: "Paiement", TICKET: "Billet",
  TRIP: "Voyage", SHIPMENT: "Colis", SYSTEM: "Information"
};

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

function changed() {
  window.dispatchEvent(new Event("notifs-changed"));
}

async function markRead(id, li, btn) {
  btn.disabled = true;
  const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
  if (error) {
    console.error(error.message);
    btn.disabled = false;
    show("Impossible de marquer la notification comme lue.", "error");
    return;
  }
  li.classList.remove("unread");
  btn.remove();
  show("", "");
  changed();
  updateMarkAll();
}

function updateMarkAll() {
  markAllBtn.hidden = !listEl.querySelector(".unread");
}

function item(n) {
  const li = el("li", "notif" + (n.is_read ? "" : " unread"));
  const head = el("div", "notif-head");
  head.append(el("span", "notif-type", TYPES[n.type] || "Information"),
              el("span", "notif-date", fmt.format(new Date(n.created_at))));
  li.append(head, el("div", "notif-title", n.title), el("div", "notif-msg", n.message));
  if (!n.is_read) {
    const btn = el("button", "linkbtn dark", "Marquer comme lu");
    btn.type = "button";
    btn.addEventListener("click", () => markRead(n.id, li, btn));
    li.append(btn);
  }
  return li;
}

async function load() {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) {
    location.replace("login.html?next=notifications.html");
    return;
  }
  show("Chargement…", "");
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error(error.message);
    show("Impossible de charger vos notifications. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren();
  if (!data.length) {
    show("Vous n'avez aucune notification.", "");
    return;
  }
  show("", "");
  for (const n of data) listEl.append(item(n));
  updateMarkAll();
}

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }
  markAllBtn.addEventListener("click", async () => {
    markAllBtn.disabled = true;
    const { error } = await supabase.rpc("mark_all_notifications_read");
    markAllBtn.disabled = false;
    if (error) {
      console.error(error.message);
      show("Impossible de tout marquer comme lu.", "error");
      return;
    }
    changed();
    await load();
  });
  await load();
}

init();

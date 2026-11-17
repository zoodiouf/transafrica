import { supabase } from "./supabase.js";

const nav = document.getElementById("nav");
const PRO_LINKS = {
  AGENCY_ADMIN: { href: "agency.html", text: "Espace agence" },
  AGENCY_AGENT: { href: "agency.html", text: "Espace agence" },
  DRIVER: { href: "driver.html", text: "Espace chauffeur" }
};
let timer = null;
let token = 0;
let countEl = null;

function link(href, text, cls) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  if (cls) a.className = cls;
  return a;
}

async function refreshCount() {
  if (!supabase || !countEl) return;
  const { data, error } = await supabase.rpc("get_unread_count");
  if (error || !countEl) return;
  const n = Number(data) || 0;
  countEl.textContent = n > 99 ? "99+" : String(n);
  countEl.hidden = n === 0;
}

function suspendedBanner() {
  if (document.getElementById("suspended-banner")) return;
  const div = document.createElement("div");
  div.id = "suspended-banner";
  div.className = "banner";
  div.textContent = "Votre compte est suspendu. Contactez le support.";
  const top = document.querySelector(".topbar");
  if (top) top.after(div);
}

async function render(session) {
  if (!nav) return;
  const my = ++token;
  clearInterval(timer);
  countEl = null;
  nav.replaceChildren();

  if (!session) {
    nav.append(link("login.html", "Connexion"), link("signup.html", "Inscription", "nav-cta"));
    return;
  }

  const bell = link("notifications.html", "🔔", "bell");
  bell.setAttribute("aria-label", "Notifications");
  const count = document.createElement("span");
  count.className = "bell-count";
  count.hidden = true;
  bell.append(count);

  const name = document.createElement("span");
  name.className = "nav-name";
  name.textContent = "Mon compte";

  const out = document.createElement("button");
  out.type = "button";
  out.className = "linkbtn";
  out.textContent = "Déconnexion";
  out.addEventListener("click", async () => {
    out.disabled = true;
    await supabase.auth.signOut();
    location.href = "index.html";
  });

  nav.append(link("bookings.html", "Réservations"), bell, name, out);
  countEl = count;

  const { data: p } = await supabase
    .from("profiles").select("full_name, is_suspended, role")
    .eq("id", session.user.id).maybeSingle();
  if (my !== token) return;
  if (p && p.full_name) name.textContent = p.full_name.trim().split(/\s+/)[0];
  if (p && p.is_suspended) suspendedBanner();
  const space = p && !p.is_suspended ? PRO_LINKS[p.role] : null;
  if (space) nav.prepend(link(space.href, space.text));

  await refreshCount();
  if (my !== token) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible") refreshCount();
  }, 60000);
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
      // Évite d'appeler Supabase directement dans le rappel d'authentification
      setTimeout(() => render(session), 0);
    }
  });
  window.addEventListener("notifs-changed", refreshCount);
} else {
  render(null);
}

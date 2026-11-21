import { supabase } from "./supabase.js";
import { el, showStatus, fmtDate } from "./ui.js";
import { requireRole, field, input, select, fillSelect, btn, dbMessage } from "./pro.js";

const ROLE = { AGENCY_AGENT: "Agent", DRIVER: "Chauffeur", AGENCY_ADMIN: "Administrateur" };
const MEMBER = { INVITED: "Invitation en attente", ACTIVE: "Actif", SUSPENDED: "Retiré" };
const BADGE = { INVITED: "low", ACTIVE: "ok", SUSPENDED: "full" };

const statusEl = document.getElementById("status");
const extraEl = document.getElementById("extra");
const formEl = document.getElementById("form");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);
let agencyId = null;

const fEmail = input("email", { max: 254, placeholder: "adresse@exemple.com" });
const fRole = select([["AGENCY_AGENT", "Agent (guichet, billets, colis)"], ["DRIVER", "Chauffeur"]]);
const fDriver = select([]);
const driverField = field("Fiche chauffeur à rattacher", fDriver);
driverField.hidden = true;
const submit = el("button", "btn", "Envoyer l'invitation");
submit.type = "submit";
formEl.append(el("h2", "h2", "Inviter un membre"),
  field("Adresse e-mail de la personne", fEmail), field("Rôle", fRole), driverField, submit);
fRole.addEventListener("change", () => { driverField.hidden = fRole.value !== "DRIVER"; });

function showInvite(email, data) {
  const origin = location.origin;
  const until = fmtDate.format(new Date(data.expires_at));
  const message = "Rejoignez notre agence sur TransAfrica : créez un compte avec l'adresse " + email
    + ", puis ouvrez " + origin + "/join.html et saisissez le code " + data.invite_code
    + ". Valable jusqu'au " + until + ".";
  const box = el("div", "card stack");
  const copyBtn = btn("Copier le message à envoyer", "btn-secondary", async (b) => {
    try {
      await navigator.clipboard.writeText(message);
      b.textContent = "Message copié";
    } catch (e) {
      show("Copie impossible : sélectionnez le texte ci-dessus et copiez-le manuellement.", "error");
    }
  });
  box.append(
    el("p", "ok-text", "Invitation créée pour " + email + "."),
    el("div", "meta", "Code d'invitation (affiché une seule fois)"),
    el("div", "ticket-code", data.invite_code),
    el("p", "note", message),
    copyBtn,
    btn("Fermer", "btn-secondary", () => extraEl.replaceChildren()));
  extraEl.replaceChildren(box);
  window.scrollTo(0, 0);
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = fEmail.value.trim().toLowerCase();
  const role = fRole.value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return show("Saisissez une adresse e-mail valide.", "error");
  if (role === "DRIVER" && !fDriver.value) return show("Choisissez la fiche du chauffeur à rattacher.", "error");

  submit.disabled = true;
  show("Création de l'invitation…", "");
  const { data, error } = await supabase.rpc("invite_member", {
    p_agency_id: agencyId, p_email: email, p_role: role,
    p_driver_id: role === "DRIVER" ? fDriver.value : null
  });
  submit.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show(dbMessage(error), "error");
    return;
  }
  show("", "");
  fEmail.value = "";
  showInvite(email, data);
  await loadDrivers();
  await load();
});

function memberCard(m) {
  const expired = m.status === "INVITED" && new Date(m.expires_at) <= new Date();
  const status = expired ? "Invitation expirée" : (MEMBER[m.status] || m.status);
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", m.full_name || m.invited_email),
    el("span", "badge " + (expired ? "full" : (BADGE[m.status] || "neutral")), status));
  li.append(top, el("div", "meta", (ROLE[m.role] || m.role) + " · " + m.invited_email));
  if (m.phone) li.append(el("div", "meta", m.phone));
  if (m.joined_at) li.append(el("div", "meta", "Depuis le " + fmtDate.format(new Date(m.joined_at))));
  if (m.status === "INVITED" || m.status === "ACTIVE") {
    li.append(btn(m.status === "INVITED" ? "Annuler l'invitation" : "Retirer de l'équipe", "btn-danger", async (b) => {
      if (!confirm("Confirmer ? Le compte redeviendra un compte client.")) return;
      b.disabled = true;
      const { error } = await supabase.rpc("remove_member", { p_member_id: m.member_id });
      if (error) {
        console.error(error.code || error.message);
        show(dbMessage(error), "error");
        b.disabled = false;
        return;
      }
      show("Membre retiré.", "");
      await loadDrivers();
      await load();
    }));
  }
  return li;
}

async function load() {
  const { data, error } = await supabase.rpc("list_team", { p_agency_id: agencyId });
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger l'équipe. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...(data || []).map(memberCard));
  if (!data || !data.length) listEl.replaceChildren(el("li", "note", "Aucun membre pour le moment."));
}

async function loadDrivers() {
  const { data, error } = await supabase.from("drivers")
    .select("id, full_name").is("user_id", null).eq("status", "ACTIVE").order("full_name");
  if (error) {
    console.error(error.code || error.message);
    return;
  }
  fillSelect(fDriver, data.map((d) => [d.id, d.full_name]), data.length ? "Choisir un chauffeur" : "Aucun chauffeur disponible");
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_team.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    formEl.hidden = true;
    return;
  }
  agencyId = ctx.profile.agency_id;
  if (!agencyId) {
    show("Votre compte n'est rattaché à aucune agence.", "error");
    formEl.hidden = true;
    return;
  }
  await loadDrivers();
  await load();
}

init();

import { supabase } from "./supabase.js";
import { el, showStatus } from "./ui.js";
import { requireRole, field, input, btn, dbMessage } from "./pro.js";

const STATUS = { ACTIVE: "Actif", ON_LEAVE: "En congé", SUSPENDED: "Suspendu" };
const BADGE = { ACTIVE: "ok", ON_LEAVE: "low", SUSPENDED: "full" };

const statusEl = document.getElementById("status");
const formEl = document.getElementById("form");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);
let agencyId = null;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dakar" });
const fmtDay = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("fr-FR", { timeZone: "UTC" });

const fName = input("text", { max: 100, placeholder: "Nom complet" });
const fPhone = input("tel", { max: 30, mode: "tel", placeholder: "+221 77 000 00 00" });
const fLicense = input("text", { max: 30, placeholder: "Numéro de permis" });
const fExpiry = input("date");
const submit = el("button", "btn", "Ajouter le chauffeur");
submit.type = "submit";
formEl.append(el("h2", "h2", "Nouveau chauffeur"),
  field("Nom complet", fName), field("Téléphone", fPhone),
  field("Numéro de permis", fLicense), field("Fin de validité du permis", fExpiry), submit);

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = fName.value.trim(), phone = fPhone.value.trim();
  const license = fLicense.value.trim().toUpperCase(), expiry = fExpiry.value;
  if (name.length < 2) return show("Saisissez le nom du chauffeur.", "error");
  if (!/^\+?[0-9 ]{8,20}$/.test(phone)) return show("Saisissez un téléphone valide, par exemple +221 77 000 00 00.", "error");
  if (license.length < 3) return show("Saisissez le numéro de permis.", "error");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry < today()) {
    return show("La date de fin de validité du permis doit être dans le futur.", "error");
  }
  submit.disabled = true;
  show("Enregistrement…", "");
  const { error } = await supabase.from("drivers").insert({
    agency_id: agencyId, full_name: name, phone, license_number: license, license_expiry: expiry
  });
  submit.disabled = false;
  if (error) {
    console.error(error.code || error.message);
    show(dbMessage(error, { "23505": "Ce numéro de permis existe déjà dans votre agence." }), "error");
    return;
  }
  show("Chauffeur ajouté.", "");
  for (const f of [fName, fPhone, fLicense, fExpiry]) f.value = "";
  await load();
});

async function setStatus(d, status, b) {
  b.disabled = true;
  if (status !== "ACTIVE") {
    const { count, error } = await supabase.from("trips").select("id", { count: "exact", head: true })
      .eq("driver_id", d.id).in("status", ["SCHEDULED", "BOARDING"]).gt("departure_at", new Date().toISOString());
    if (error) {
      console.error(error.code || error.message);
      show("Impossible de vérifier les départs de ce chauffeur. Réessayez.", "error");
      b.disabled = false;
      return;
    }
    if (count > 0) {
      show("Ce chauffeur a " + count + " départ(s) à venir : affectez-les à un autre chauffeur d'abord.", "error");
      b.disabled = false;
      return;
    }
  }
  const { error } = await supabase.from("drivers").update({ status }).eq("id", d.id);
  if (error) {
    console.error(error.code || error.message);
    show(dbMessage(error), "error");
    b.disabled = false;
    return;
  }
  show("Statut du chauffeur mis à jour.", "");
  await load();
}

function card(d) {
  const li = el("li", "trip");
  const top = el("div", "trip-top");
  top.append(el("span", "agency", d.full_name), el("span", "badge " + (BADGE[d.status] || "neutral"), STATUS[d.status] || d.status));
  li.append(top, el("div", "meta", d.phone),
    el("div", "meta", "Permis " + d.license_number + " · valable jusqu'au " + fmtDay(d.license_expiry)
      + (d.license_expiry < today() ? " (expiré)" : "")),
    el("div", "meta", d.user_id ? "Compte de connexion lié" : "Sans compte : invitez-le depuis « Équipe »."));
  if (d.status === "ACTIVE") {
    li.append(btn("Mettre en congé", "btn-secondary", (b) => setStatus(d, "ON_LEAVE", b)),
      btn("Suspendre", "btn-danger", async (b) => {
        if (!confirm("Suspendre ce chauffeur ?")) return;
        await setStatus(d, "SUSPENDED", b);
      }));
  } else {
    li.append(btn("Réactiver", "btn-secondary", (b) => setStatus(d, "ACTIVE", b)));
  }
  return li;
}

async function load() {
  const { data, error } = await supabase.from("drivers")
    .select("id, full_name, phone, license_number, license_expiry, status, user_id")
    .order("full_name").limit(100);
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les chauffeurs. Réessayez dans un instant.", "error");
    return;
  }
  listEl.replaceChildren(...(data || []).map(card));
  if (!data || !data.length) listEl.replaceChildren(el("li", "note", "Aucun chauffeur pour le moment."));
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_drivers.html");
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
  await load();
}

init();

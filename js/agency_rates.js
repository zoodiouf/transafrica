import { supabase } from "./supabase.js";
import { el, showStatus } from "./ui.js";
import { requireRole, field, input, btn, parseInteger, dbMessage } from "./pro.js";
import { SHIPMENT_CATEGORIES } from "./labels.js";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const show = (m, k) => showStatus(statusEl, m, k);
let agencyId = null;

function card(category, label, row) {
  const li = el("li", "trip");
  li.append(el("div", "agency", label),
    el("div", "meta", row ? "" : "Non proposé pour le moment : enregistrez un tarif pour le proposer."));
  const base = input("text", { mode: "numeric", max: 9, value: row ? String(row.base_price) : "" });
  const perKg = input("text", { mode: "numeric", max: 9, value: row ? String(row.price_per_kg) : "0" });
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = row ? row.is_active : true;
  const chkLabel = el("label", "chk");
  chkLabel.append(chk, document.createTextNode(" Proposé aux clients"));
  li.append(field("Prix de base (FCFA)", base), field("Prix par kg (FCFA, arrondi au kg supérieur)", perKg), chkLabel,
    btn("Enregistrer", "", async (b) => {
      const bp = parseInteger(base.value, 0, 1000000);
      const pk = parseInteger(perKg.value, 0, 100000);
      if (bp === null) return show("Le prix de base doit être un nombre entier entre 0 et 1 000 000 FCFA.", "error");
      if (pk === null) return show("Le prix par kg doit être un nombre entier entre 0 et 100 000 FCFA.", "error");
      b.disabled = true;
      const { error } = await supabase.from("shipment_rates").upsert(
        { agency_id: agencyId, category, base_price: bp, price_per_kg: pk, is_active: chk.checked },
        { onConflict: "agency_id,category" });
      b.disabled = false;
      if (error) {
        console.error(error.code || error.message);
        show(dbMessage(error), "error");
        return;
      }
      show("Tarif « " + label + " » enregistré.", "");
    }));
  return li;
}

async function init() {
  const ctx = await requireRole(["AGENCY_ADMIN"], "agency_rates.html");
  if (ctx.redirected) return;
  if (ctx.error) {
    show(ctx.error, "error");
    return;
  }
  agencyId = ctx.profile.agency_id;
  if (!agencyId) {
    show("Votre compte n'est rattaché à aucune agence.", "error");
    return;
  }
  const { data, error } = await supabase.from("shipment_rates")
    .select("category, base_price, price_per_kg, is_active");
  if (error) {
    console.error(error.code || error.message);
    show("Impossible de charger les tarifs. Réessayez dans un instant.", "error");
    return;
  }
  const byCat = new Map((data || []).map((r) => [r.category, r]));
  listEl.replaceChildren(...Object.entries(SHIPMENT_CATEGORIES).map(([c, l]) => card(c, l, byCat.get(c))));
}

init();

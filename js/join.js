import { supabase } from "./supabase.js";
import { showStatus, userMessage, requireSession } from "./ui.js";

const form = document.getElementById("join-form");
const input = document.getElementById("code");
const btn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const show = (m, k) => showStatus(statusEl, m, k);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = input.value.trim();
  if (!/^[0-9a-f]{32}$/i.test(code)) {
    show("Le code d'invitation comporte 32 caractères (chiffres et lettres a à f).", "error");
    return;
  }
  btn.disabled = true;
  show("Vérification…", "");
  const { data, error } = await supabase.rpc("accept_invitation", { p_code: code.toLowerCase() });
  if (error) {
    console.error(error.code || error.message);
    show(userMessage(error), "error");
    btn.disabled = false;
    return;
  }
  show("Bienvenue ! Redirection vers votre espace…", "");
  location.href = data && data.role === "DRIVER" ? "driver.html" : "agency.html";
});

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    form.hidden = true;
    return;
  }
  await requireSession(supabase, "join.html");
}

init();

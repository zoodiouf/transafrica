import { supabase } from "./supabase.js";

const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const ALLOWED_NEXT = ["index.html", "notifications.html"];

function show(message, kind) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
  statusEl.hidden = !message;
}

function nextPage() {
  const n = new URLSearchParams(location.search).get("next");
  return ALLOWED_NEXT.includes(n) ? n : "index.html";
}

function messageFor(error) {
  switch (error && error.code) {
    case "invalid_credentials":
      return "E-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Votre adresse e-mail n'est pas encore confirmée.";
    case "user_already_exists":
    case "email_exists":
      return "Cette adresse e-mail est déjà utilisée. Essayez de vous connecter.";
    case "weak_password":
      return "Mot de passe trop faible : utilisez au moins 8 caractères.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "signup_disabled":
      return "Les inscriptions sont momentanément fermées.";
    default:
      return "Une erreur est survenue. Réessayez dans un instant.";
  }
}

function value(id) {
  const node = document.getElementById(id);
  return node ? node.value : "";
}

async function init() {
  if (!supabase) {
    show("Configuration manquante : renseignez l'adresse et la clé publique dans js/config.js.", "error");
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    location.replace(nextPage());
    return;
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = value("email").trim();
      const password = value("password");
      if (!email || !password) {
        show("Saisissez votre e-mail et votre mot de passe.", "error");
        return;
      }
      submitBtn.disabled = true;
      show("Connexion en cours…", "");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      submitBtn.disabled = false;
      if (error) {
        console.error(error.code || error.message);
        show(messageFor(error), "error");
        return;
      }
      location.href = nextPage();
    });
  }

  const signupForm = document.getElementById("signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = value("full_name").trim();
      const phone = value("phone").trim();
      const email = value("email").trim();
      const password = value("password");
      const password2 = value("password2");

      if (fullName.length < 2 || fullName.length > 100) {
        show("Saisissez votre nom complet (2 à 100 caractères).", "error");
        return;
      }
      if (!/^\+?[0-9 ]{8,20}$/.test(phone)) {
        show("Saisissez un numéro de téléphone valide, par exemple +221 77 000 00 00.", "error");
        return;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        show("Saisissez une adresse e-mail valide.", "error");
        return;
      }
      if (password.length < 8) {
        show("Le mot de passe doit contenir au moins 8 caractères.", "error");
        return;
      }
      if (password !== password2) {
        show("Les deux mots de passe ne sont pas identiques.", "error");
        return;
      }

      submitBtn.disabled = true;
      show("Création du compte…", "");
      const { data: res, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone } }
      });
      submitBtn.disabled = false;
      if (error) {
        console.error(error.code || error.message);
        show(messageFor(error), "error");
        return;
      }
      if (res.session) {
        location.href = nextPage();
        return;
      }
      show("Compte créé. Vérifiez votre boîte e-mail pour confirmer votre adresse, puis connectez-vous.", "");
    });
  }
}

init();

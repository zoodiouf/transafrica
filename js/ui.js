export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const fmtDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar", weekday: "short", day: "2-digit", month: "short",
  hour: "2-digit", minute: "2-digit"
});
export const fmtTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Dakar", hour: "2-digit", minute: "2-digit"
});
export const fmtMoney = (n) => new Intl.NumberFormat("fr-FR").format(Number(n)) + " FCFA";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function showStatus(node, message, kind) {
  if (!node) return;
  node.textContent = message;
  node.className = "status" + (kind ? " " + kind : "");
  node.hidden = !message;
}

export function paramId() {
  const id = (new URLSearchParams(location.search).get("id") || "").toLowerCase();
  return UUID_RE.test(id) ? id : null;
}

// Les messages des fonctions de la base (P0001) sont écrits pour l'utilisateur.
export function userMessage(error, fallback) {
  if (error && error.code === "P0001" && typeof error.message === "string" && error.message.length < 200) {
    return error.message;
  }
  return fallback || "Une erreur est survenue. Réessayez dans un instant.";
}

export async function requireSession(supabase, nextPath) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.replace("login.html?next=" + encodeURIComponent(nextPath));
    return null;
  }
  return data.session;
}

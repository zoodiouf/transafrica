export const LUGGAGE_TYPES = {
  HAND: "Bagage à main (gratuit)", HOLD: "Bagage en soute",
  OVERSIZED: "Bagage volumineux", FRAGILE: "Bagage fragile"
};
export const LUGGAGE_STATUS = {
  DECLARED: "Déclaré", WEIGHED: "Pesé", LOADED: "Chargé",
  UNLOADED: "Déchargé", DELIVERED: "Remis", LOST: "Perdu"
};
export const SHIPMENT_CATEGORIES = {
  DOCUMENT: "Document", SMALL_PARCEL: "Petit colis", LARGE_PARCEL: "Gros colis",
  FRAGILE: "Colis fragile", VALUABLE: "Objet de valeur"
};
export const SHIPMENT_STATUS = {
  CREATED: "Enregistré", DROPPED_AT_AGENCY: "Reçu à l'agence", LOADED: "Chargé",
  IN_TRANSIT: "En route", ARRIVED: "Arrivé", READY_FOR_PICKUP: "Prêt à retirer",
  DELIVERED: "Livré", RETURNED: "Retourné", CANCELLED: "Annulé"
};
export const SHIPMENT_BADGE = {
  CREATED: "low", DROPPED_AT_AGENCY: "neutral", LOADED: "neutral", IN_TRANSIT: "neutral",
  ARRIVED: "neutral", READY_FOR_PICKUP: "ok", DELIVERED: "ok", RETURNED: "full", CANCELLED: "full"
};

// Convertit "12,5" ou "12.5" en nombre à une décimale ; null si invalide.
export function parseNumber(value) {
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) && String(value).trim() !== "" ? Math.round(n * 10) / 10 : null;
}

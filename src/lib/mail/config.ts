import "server-only";

// ═══════════════════════════════════════════════════════════════════════════
// GARDE-FOU CENTRAL DES ENVOIS
//
// Tant que MAIL_MODE ne vaut pas exactement "production", la plateforme est en
// BAC À SABLE : tout mail, quel que soit son destinataire réel, part vers la
// seule adresse MAIL_SANDBOX_TO, avec un objet préfixé rappelant le
// destinataire d'origine. Aucun élève ne peut recevoir quoi que ce soit.
//
// Le basculement est explicite et manuel (variable d'environnement), jamais
// déduit de NODE_ENV : un déploiement ne peut pas ouvrir les vannes par accident.
// ═══════════════════════════════════════════════════════════════════════════

export type MailMode = "sandbox" | "production";

export function getMailMode(): MailMode {
  return process.env.MAIL_MODE?.trim() === "production" ? "production" : "sandbox";
}

export function isSandbox(): boolean {
  return getMailMode() !== "production";
}

export function getSandboxAddress(): string {
  const to = process.env.MAIL_SANDBOX_TO?.trim();
  if (!to) throw new Error("MAIL_SANDBOX_TO manquante : envoi impossible en bac à sable.");
  return to;
}

export function getMailFrom(): string {
  const from = process.env.MAIL_FROM?.trim();
  if (!from) throw new Error("MAIL_FROM manquante.");
  return from;
}

export const SANDBOX_SUBJECT_PREFIX = "[BAC À SABLE]";

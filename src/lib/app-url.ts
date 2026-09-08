import "server-only";

// URL publique de la plateforme, base de tous les liens envoyés par mail.
// Sans NEXT_PUBLIC_APP_URL, les liens pointent vers la machine de développement
// (voir DEPLOIEMENT.md : à définir avant tout envoi réel).
export function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return path ? new URL(path, base).toString() : base;
}

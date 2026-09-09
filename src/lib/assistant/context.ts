import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// ═══════════════════════════════════════════════════════════════════════════
// LE SOCLE DES OUTILS DE MINI ARSÈNE
//
// Règle unique et non négociable : l'assistant agit AVEC les droits de la
// personne connectée, jamais au-dessus. Chaque outil refait ici les mêmes
// vérifications que les écrans — permission, puis périmètre du propriétaire.
// Aucun outil n'utilise la clé de service pour contourner quoi que ce soit.
//
// Les outils d'ÉCRITURE ne s'exécutent que si leur nom figure dans `approved`,
// c'est-à-dire après un clic de confirmation dans l'interface. Sinon ils
// renvoient une proposition, que le modèle présente à l'utilisateur.
// ═══════════════════════════════════════════════════════════════════════════

export type ToolContext = {
  me: CurrentUser;
  /// Noms des outils d'écriture autorisés pour ce tour, après confirmation.
  approved: string[];
  /// Rempli au fil de l'exécution : ce que l'assistant a fait ou veut faire.
  trace: { tool: string; summary: string; done: boolean }[];
};

export const has = (me: CurrentUser, key: string) => me.permissions.has(key);

// Périmètre des sessions : les siennes, ou toutes pour un superviseur.
export function sessionScope(me: CurrentUser) {
  return canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] };
}

// Périmètre des lignes possédées (formation, entreprise).
export function ownedScope(me: CurrentUser) {
  return canSupervise(me) ? {} : { ownerId: me.id };
}

// Le SDK attend une chaîne : on sérialise, le modèle lit du JSON très bien.
export const json = (value: unknown) => JSON.stringify(value);

export function refuse(reason: string) {
  return json({ erreur: reason });
}

// Demande de confirmation : l'action n'est pas jouée, elle est proposée.
// C'est ce qui empêche une phrase ambiguë de créer quoi que ce soit.
export function propose(ctx: ToolContext, tool: string, summary: string) {
  ctx.trace.push({ tool, summary, done: false });
  return json({
    confirmation_requise: true,
    resume: summary,
    consigne:
      "Explique à l'utilisateur ce que tu t'apprêtes à faire et arrête-toi là. N'affirme jamais que c'est fait.",
  });
}

export function done(ctx: ToolContext, tool: string, summary: string) {
  ctx.trace.push({ tool, summary, done: true });
}

// Trace d'audit : une action de l'assistant se distingue d'une action manuelle.
export async function log(me: CurrentUser, action: string, targetType: string, targetId: string) {
  await prisma.accessLog.create({
    data: { userId: me.id, action: `assistant_${action}`, targetType, targetId },
  });
}

// Une date « AAAA-MM-JJ » écrite par le modèle, refusée si elle n'a pas de sens.
export function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

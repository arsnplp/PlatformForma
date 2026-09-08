import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// Un fil par élève et par session (spec §5.8). Y ont accès l'élève concerné et
// l'encadrement de la session ; jamais les autres élèves, même de la session.
export type ConversationAccess = { allowed: false } | { allowed: true; role: "student" | "trainer" };

export async function checkConversationAccess(conversationId: string, me: CurrentUser): Promise<ConversationAccess> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, session: { select: { ownerId: true, trainerId: true } } },
  });
  if (!conversation) return { allowed: false };
  if (conversation.userId === me.id) return { allowed: true, role: "student" };
  if (canSupervise(me) || conversation.session.ownerId === me.id || conversation.session.trainerId === me.id) {
    return { allowed: true, role: "trainer" };
  }
  return { allowed: false };
}

// Récupère le fil d'un élève pour une session, en le créant au besoin.
// Réservé au serveur : l'appelant a déjà vérifié les droits.
export function ensureConversation(sessionId: string, userId: string) {
  return prisma.conversation.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId },
    update: {},
  });
}

// Marque le fil comme lu par cette personne. Appelé au rendu du fil, comme
// logAccess sur le dossier élève : c'est la lecture réelle qui fait foi, et
// c'est elle qui annule une notification en attente.
export function markConversationRead(conversationId: string, userId: string) {
  const readAt = new Date();
  return prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, readAt },
    update: { readAt },
  });
}

// Fils non lus par cette personne : identifiants des conversations dont le
// dernier message d'un autre est postérieur à sa dernière ouverture.
export async function unreadConversationIds(conversationIds: string[], userId: string): Promise<Set<string>> {
  if (conversationIds.length === 0) return new Set();

  const [reads, lastMessages] = await Promise.all([
    prisma.conversationRead.findMany({
      where: { userId, conversationId: { in: conversationIds } },
      select: { conversationId: true, readAt: true },
    }),
    prisma.message.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: conversationIds }, senderId: { not: userId } },
      _max: { sentAt: true },
    }),
  ]);
  const readAt = new Map(reads.map((r) => [r.conversationId, r.readAt]));

  const unread = new Set<string>();
  for (const row of lastMessages) {
    const last = row._max.sentAt;
    if (!last) continue;
    const seen = readAt.get(row.conversationId);
    if (!seen || seen < last) unread.add(row.conversationId);
  }
  return unread;
}

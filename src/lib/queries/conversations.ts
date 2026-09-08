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

// Messages non lus, par fil : ceux d'un autre, postérieurs à la dernière
// ouverture. Une seule requête, quelle que soit le nombre de fils — chaque
// fil a sa propre date de lecture, d'où le OR construit branche par branche.
async function unreadCounts(conversationIds: string[], userId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (conversationIds.length === 0) return counts;

  const reads = await prisma.conversationRead.findMany({
    where: { userId, conversationId: { in: conversationIds } },
    select: { conversationId: true, readAt: true },
  });
  const readAt = new Map(reads.map((r) => [r.conversationId, r.readAt]));

  const rows = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      senderId: { not: userId },
      OR: conversationIds.map((id) => {
        const seen = readAt.get(id);
        return seen ? { conversationId: id, sentAt: { gt: seen } } : { conversationId: id };
      }),
    },
    _count: { _all: true },
  });
  for (const row of rows) counts.set(row.conversationId, row._count._all);
  return counts;
}

// Total pour la pastille de la navigation.
export async function countUnreadMessages(me: CurrentUser): Promise<number> {
  // Élève : ses fils. Encadrement : ceux des sessions qu'il possède ou anime.
  // Superviseur : tous, comme pour le reste de sa supervision.
  const where = canSupervise(me)
    ? {}
    : { OR: [{ userId: me.id }, { session: { OR: [{ ownerId: me.id }, { trainerId: me.id }] } }] };

  const conversations = await prisma.conversation.findMany({ where, select: { id: true } });
  const counts = await unreadCounts(conversations.map((c) => c.id), me.id);
  return [...counts.values()].reduce((n, c) => n + c, 0);
}

// Non lus par session, pour l'élève : la pastille se pose sur la bonne
// formation, pas sur un total anonyme.
export async function unreadBySession(userId: string, sessionIds: string[]): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();
  const conversations = await prisma.conversation.findMany({
    where: { userId, sessionId: { in: sessionIds } },
    select: { id: true, sessionId: true },
  });
  const counts = await unreadCounts(conversations.map((c) => c.id), userId);
  const bySession = new Map<string, number>();
  for (const c of conversations) {
    const n = counts.get(c.id) ?? 0;
    if (n > 0) bySession.set(c.sessionId, n);
  }
  return bySession;
}

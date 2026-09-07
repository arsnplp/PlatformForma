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

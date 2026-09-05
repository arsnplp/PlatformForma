import "server-only";

import { prisma } from "@/lib/prisma";

// Journal d'accès (spec §12) : qui a ouvert / exporté quoi, quand.
// Dédupliqué : une seule ligne par (acteur, action, cible) sur une fenêtre
// glissante, pour qu'un rafraîchissement de page ne pollue pas l'audit.
export const ACCESS_LOG_DEDUP_MINUTES = 15;

export async function logAccess(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  opts: { dedupMinutes?: number } = {},
) {
  const minutes = opts.dedupMinutes ?? ACCESS_LOG_DEDUP_MINUTES;
  if (minutes > 0) {
    const since = new Date(Date.now() - minutes * 60_000);
    const recent = await prisma.accessLog.findFirst({
      where: { userId: actorId, action, targetType, targetId, at: { gte: since } },
      select: { id: true },
    });
    if (recent) return;
  }
  await prisma.accessLog.create({ data: { userId: actorId, action, targetType, targetId } });
}

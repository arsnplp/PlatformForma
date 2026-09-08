import "server-only";

import { prisma } from "@/lib/prisma";
import { todayInParis } from "@/lib/process/today";

// ═══════════════════════════════════════════════════════════════════════════
// RECONSTRUCTION DES TOTAUX DEPUIS LES TRACES BRUTES
//
// ActivityLog est la source de vérité : chaque battement y est écrit tel quel.
// TimeAggregate n'est qu'un cumul, tenu à jour au fil de l'eau pour l'affichage.
//
// Avant d'établir un relevé destiné à un financeur, on recalcule ce cumul à
// partir des traces : la pièce produite dérive ainsi toujours des données
// brutes, et un écart accidentel du cumul ne peut pas se retrouver dans une
// preuve d'assiduité.
// ═══════════════════════════════════════════════════════════════════════════

export async function rebuildTimeAggregates(sessionId: string, userId: string): Promise<number> {
  const logs = await prisma.activityLog.findMany({
    where: { sessionId, userId, eventType: "heartbeat", durationSeconds: { not: null } },
    select: { at: true, durationSeconds: true, moduleId: true, lessonId: true, exerciseId: true },
  });

  type Key = { scopeType: "session" | "module" | "lesson" | "exercise"; scopeId: string; day: Date };
  const totals = new Map<string, Key & { seconds: number }>();

  const add = (key: Key, seconds: number) => {
    const id = `${key.scopeType}:${key.scopeId}:${key.day.toISOString()}`;
    const current = totals.get(id);
    if (current) current.seconds += seconds;
    else totals.set(id, { ...key, seconds });
  };

  for (const log of logs) {
    const seconds = log.durationSeconds ?? 0;
    if (seconds <= 0) continue;
    // Jour civil français, comme à l'écriture.
    const day = todayInParis(log.at);
    add({ scopeType: "session", scopeId: sessionId, day }, seconds);
    if (log.moduleId) add({ scopeType: "module", scopeId: log.moduleId, day }, seconds);
    if (log.lessonId) add({ scopeType: "lesson", scopeId: log.lessonId, day }, seconds);
    if (log.exerciseId) add({ scopeType: "exercise", scopeId: log.exerciseId, day }, seconds);
  }

  const rows = [...totals.values()];
  await prisma.$transaction([
    prisma.timeAggregate.deleteMany({ where: { sessionId, userId } }),
    prisma.timeAggregate.createMany({
      data: rows.map((row) => ({
        userId, sessionId, scopeType: row.scopeType, scopeId: row.scopeId, day: row.day, totalSeconds: row.seconds,
      })),
    }),
  ]);

  return rows.length;
}

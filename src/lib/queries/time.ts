import "server-only";

import { prisma } from "@/lib/prisma";
import { todayInParis } from "@/lib/process/today";

// Lecture du temps de connexion : ce qui nourrit la vue analytique du
// formateur et le relevé FOAD remis au financeur.

/// `simulated` : part du total produite par le générateur, pour distinguer
/// d'un coup d'œil ce qui a été mesuré de ce qui a été fabriqué.
export type DailyRow = { day: Date; seconds: number; simulatedSeconds: number };
export type ScopeRow = { label: string; seconds: number };

export async function getStudentSessionTime(sessionId: string, userId: string) {
  const [aggregates, session, modules, simulated] = await Promise.all([
    prisma.timeAggregate.findMany({
      where: { sessionId, userId },
      orderBy: [{ day: "asc" }],
      select: { day: true, scopeType: true, scopeId: true, totalSeconds: true },
    }),
    prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        name: true, startDate: true, endDate: true, durationHours: true, isDemo: true,
        formationVersion: { select: { formation: { select: { name: true } } } },
      },
    }),
    prisma.module.findMany({
      where: { formationVersion: { sessions: { some: { id: sessionId } } } },
      orderBy: { order: "asc" },
      select: { id: true, order: true, title: true, lessons: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } },
    }),
    // Détail des traces fabriquées, jour par jour : c'est ce qui permet de ne
    // jamais confondre une journée mesurée et une journée simulée.
    prisma.activityLog.findMany({
      where: { sessionId, userId, isDemo: true, eventType: "heartbeat" },
      select: { at: true, durationSeconds: true },
    }),
  ]);

  const lessonTitle = new Map<string, string>();
  const moduleTitle = new Map<string, string>();
  for (const mod of modules) {
    moduleTitle.set(mod.id, `Module ${mod.order} — ${mod.title}`);
    for (const lesson of mod.lessons) lessonTitle.set(lesson.id, `${mod.order}.${lesson.order} ${lesson.title}`);
  }

  // Total par jour : la ligne « session » suffit, elle porte tout le temps.
  const byDay = new Map<number, number>();
  for (const row of aggregates) {
    if (row.scopeType !== "session") continue;
    byDay.set(row.day.getTime(), (byDay.get(row.day.getTime()) ?? 0) + row.totalSeconds);
  }

  // Même découpage pour la part fabriquée, au même repère de jour français.
  const simulatedByDay = new Map<number, number>();
  for (const log of simulated) {
    const key = todayInParis(log.at).getTime();
    simulatedByDay.set(key, (simulatedByDay.get(key) ?? 0) + (log.durationSeconds ?? 0));
  }

  const days: DailyRow[] = [...byDay.entries()]
    .map(([time, seconds]) => ({ day: new Date(time), seconds, simulatedSeconds: simulatedByDay.get(time) ?? 0 }))
    .sort((a, b) => a.day.getTime() - b.day.getTime());

  const sum = (type: "module" | "lesson", titles: Map<string, string>): ScopeRow[] => {
    const totals = new Map<string, number>();
    for (const row of aggregates) {
      if (row.scopeType !== type) continue;
      totals.set(row.scopeId, (totals.get(row.scopeId) ?? 0) + row.totalSeconds);
    }
    return [...totals.entries()]
      .map(([id, seconds]) => ({ label: titles.get(id) ?? "—", seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  };

  const simulatedSeconds = simulated.reduce((total, log) => total + (log.durationSeconds ?? 0), 0);

  return {
    session,
    /// Le total inclut des traces fabriquées : le relevé le signale.
    simulated: simulated.length > 0,
    simulatedSeconds,
    days,
    modules: sum("module", moduleTitle),
    lessons: sum("lesson", lessonTitle),
    totalSeconds: days.reduce((total, row) => total + row.seconds, 0),
  };
}

// Toutes les sessions d'un élève, avec son temps : vue d'ensemble du dossier.
export async function getStudentTimeOverview(userId: string, sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  const rows = await prisma.timeAggregate.groupBy({
    by: ["sessionId"],
    where: { userId, sessionId: { in: sessionIds }, scopeType: "session" },
    _sum: { totalSeconds: true },
  });
  return rows.map((row) => ({ sessionId: row.sessionId, seconds: row._sum.totalSeconds ?? 0 }));
}

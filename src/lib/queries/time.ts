import "server-only";

import { prisma } from "@/lib/prisma";

// Lecture du temps de connexion : ce qui nourrit la vue analytique du
// formateur et le relevé FOAD remis au financeur.

export type DailyRow = { day: Date; seconds: number };
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
    // Des traces fabriquées entrent-elles dans ce total ? Un relevé doit
    // pouvoir dire quand il n'est pas une mesure.
    prisma.activityLog.count({ where: { sessionId, userId, isDemo: true } }),
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
  const days: DailyRow[] = [...byDay.entries()]
    .map(([time, seconds]) => ({ day: new Date(time), seconds }))
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

  return {
    session,
    /// Le total inclut des traces fabriquées : le relevé le signale.
    simulated: simulated > 0,
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

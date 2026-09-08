import "server-only";

import { prisma } from "@/lib/prisma";
import { todayInParis } from "@/lib/process/today";
import { HEARTBEAT_SECONDS } from "@/lib/activity/config";
import type { Prisma } from "@/generated/prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// DONNÉES DE DÉMONSTRATION
//
// Tout ce que ce module fabrique porte isDemo = true, à chaque niveau :
// session, inscription, soumission, trace d'activité, document. Conséquences,
// garanties par le code existant : aucun mail n'est envoyé, aucune demande de
// signature ne part chez le prestataire, et l'export estampille chaque page.
//
// Une donnée fabriquée ne doit jamais pouvoir passer pour une donnée vécue.
// ═══════════════════════════════════════════════════════════════════════════

const FIRST_NAMES = ["Camille", "Malik", "Sofia", "Thomas", "Léa", "Youssef", "Chloé", "Antoine"];
const LAST_NAMES = ["Bernard", "Nguyen", "Marchand", "Diallo", "Roux", "Lemoine", "Costa", "Fabre"];

// Générateur pseudo-aléatoire déterministe : deux élèves d'une même session
// ont des parcours différents, mais une même graine redonne le même résultat.
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

const pick = <T,>(rand: () => number, list: T[]): T => list[Math.floor(rand() * list.length) % list.length];

// ── Activité d'UN élève ────────────────────────────────────────────────────
//
// On vise le crédible, pas le parfait : des durées qui s'écartent de la durée
// prévue, un ordre de lecture qui n'est pas strictement linéaire, des relectures
// et des exercices inégalement réussis. Un élève modèle se repère au premier
// coup d'œil et ne ressemble à rien.
export async function generateStudentActivity(params: {
  sessionId: string;
  userId: string;
}): Promise<{ beats: number; submissions: number; days: number }> {
  const { sessionId, userId } = params;

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      startDate: true, endDate: true, isDemo: true,
      formationVersion: {
        select: {
          modules: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              lessons: {
                orderBy: { order: "asc" },
                select: { id: true, durationMinutes: true, exercises: { select: { id: true, maxScore: true, type: true } } },
              },
              exercises: { select: { id: true, maxScore: true, type: true } },
            },
          },
        },
      },
    },
  });

  const rand = seeded(`${sessionId}:${userId}`);
  const lessons = session.formationVersion.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, moduleId: m.id })),
  );
  if (lessons.length === 0) return { beats: 0, submissions: 0, days: 0 };

  // On remplace l'activité FABRIQUÉE, et elle seule : les traces réelles d'un
  // élève sont du vécu, ce générateur n'y touche jamais.
  await prisma.$transaction([
    prisma.timeAggregate.deleteMany({ where: { sessionId, userId } }),
    prisma.activityLog.deleteMany({ where: { sessionId, userId, eventType: "heartbeat", isDemo: true } }),
  ]);

  // Jours de travail : quelques journées dans la fenêtre de la session, jamais
  // dans le futur.
  const start = new Date(session.startDate);
  const horizon = todayInParis();
  const dayCount = 3 + Math.floor(rand() * 3);
  const days: Date[] = [];
  for (let i = 0; i < dayCount; i++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + Math.floor(rand() * 9));
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    days.push(day > horizon ? new Date(horizon) : day);
  }
  days.sort((a, b) => a.getTime() - b.getTime());

  // Ordre de lecture : globalement celui du programme, avec quelques
  // permutations locales et des relectures.
  const order = [...lessons];
  for (let i = 1; i < order.length; i++) {
    if (rand() < 0.25) [order[i - 1], order[i]] = [order[i], order[i - 1]];
  }
  const visits = order.flatMap((lesson) => (rand() < 0.3 ? [lesson, lesson] : [lesson]));

  const logs: Prisma.ActivityLogCreateManyInput[] = [];
  let cursor = 0;
  for (const day of days) {
    const slice = Math.max(1, Math.round(visits.length / days.length));
    for (let i = 0; i < slice && cursor < visits.length; i++, cursor++) {
      const lesson = visits[cursor];
      const planned = lesson.durationMinutes ?? 30;
      // Entre 55 % et 130 % du temps prévu : personne ne colle au programme.
      const minutes = Math.max(2, Math.round(planned * (0.55 + rand() * 0.75)));
      const beats = Math.max(1, Math.round((minutes * 60) / HEARTBEAT_SECONDS));
      const startHour = 8 + Math.floor(rand() * 9);
      for (let b = 0; b < beats; b++) {
        const at = new Date(day);
        at.setUTCHours(startHour, 0, 0, 0);
        logs.push({
          userId, sessionId, moduleId: lesson.moduleId, lessonId: lesson.id,
          // isDemo marque la trace comme fabriquée. C'est ce qui permet, plus
          // loin, de ne jamais présenter un temps simulé comme une mesure.
          eventType: "heartbeat", durationSeconds: HEARTBEAT_SECONDS, isDemo: true,
          at: new Date(at.getTime() + b * HEARTBEAT_SECONDS * 1000),
        });
      }
    }
  }
  if (logs.length > 0) await prisma.activityLog.createMany({ data: logs });

  // Exercices : inégalement réussis, et tous ne sont pas rendus.
  const exercises = session.formationVersion.modules.flatMap((m) => [
    ...m.exercises,
    ...m.lessons.flatMap((l) => l.exercises),
  ]);
  let submissions = 0;
  for (const exercise of exercises) {
    if (rand() < 0.25) continue;
    const already = await prisma.submission.findFirst({ where: { exerciseId: exercise.id, userId, sessionId } });
    if (already) continue;
    const max = exercise.maxScore ?? 20;
    const score = Math.round(max * (0.45 + rand() * 0.55));
    await prisma.submission.create({
      data: {
        exerciseId: exercise.id, userId, sessionId,
        status: "graded", autoScore: score, isDemo: true,
        content: { kind: "generated", note: "Réponse de démonstration" },
        submittedAt: days[Math.floor(rand() * days.length)] ?? new Date(),
        gradedAt: new Date(),
      },
    });
    submissions++;
  }

  return { beats: logs.length, submissions, days: days.length };
}

export function demoStudentName(index: number, rand: () => number): string {
  return `${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}${index > FIRST_NAMES.length ? ` ${index}` : ""}`;
}

export { seeded };

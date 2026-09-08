"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { MAX_HEARTBEAT_SECONDS } from "@/lib/activity/config";

const beatSchema = z.object({
  sessionId: z.string().uuid(),
  lessonId: z.string().uuid().nullable().optional(),
  exerciseId: z.string().uuid().nullable().optional(),
  seconds: z.number().int().min(1).max(MAX_HEARTBEAT_SECONDS),
});

export type BeatInput = z.input<typeof beatSchema>;

// Un battement de présence. Volontairement avare : on n'enregistre que si
// l'élève est bien inscrit à la session et que la leçon appartient à la
// version que cette session a figée.
export async function recordHeartbeat(input: BeatInput): Promise<{ ok: boolean; seconds?: number }> {
  const me = await requireUser();
  const parsed = beatSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { sessionId, lessonId, exerciseId, seconds } = parsed.data;

  const enrollment = await prisma.enrollment.findUnique({
    where: { sessionId_userId: { sessionId, userId: me.id } },
    select: { isDemo: true, session: { select: { isDemo: true, status: true } } },
  });
  // Un formateur en aperçu ne génère pas de temps de connexion : le relevé
  // FOAD ne concerne que les apprenants inscrits.
  if (!enrollment) return { ok: false };
  if (enrollment.session.status === "cancelled") return { ok: false };

  let moduleId: string | null = null;
  if (lessonId) {
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, module: { formationVersion: { sessions: { some: { id: sessionId } } } } },
      select: { moduleId: true },
    });
    if (!lesson) return { ok: false };
    moduleId = lesson.moduleId;
  }

  await prisma.activityLog.create({
    data: {
      userId: me.id, sessionId, moduleId, lessonId: lessonId ?? null, exerciseId: exerciseId ?? null,
      eventType: "heartbeat",
      durationSeconds: seconds,
      isDemo: enrollment.session.isDemo,
    },
  });

  return { ok: true, seconds };
}

// Temps déjà cumulé par l'élève sur cette leçon, pour l'afficher.
export async function getMyLessonSeconds(sessionId: string, lessonId: string): Promise<number> {
  const me = await requireUser();
  const total = await prisma.activityLog.aggregate({
    where: { userId: me.id, sessionId, lessonId, eventType: "heartbeat" },
    _sum: { durationSeconds: true },
  });
  return total._sum.durationSeconds ?? 0;
}

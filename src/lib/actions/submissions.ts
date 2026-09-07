"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { gradeAnswer, type Answer } from "@/lib/content/grading";
import type { Prisma } from "@/generated/prisma/client";

export type SubmitState = { error?: string } | undefined;

// Une soumission est du VÉCU : une seule par élève, exercice et session, et
// elle n'est jamais modifiée ensuite. La correction automatique s'applique
// immédiatement ; les types manuels attendent le formateur.
export async function submitAnswer(exerciseId: string, sessionId: string, answer: Answer): Promise<SubmitState> {
  const me = await requireUser();

  // L'élève doit être inscrit, et l'exercice appartenir à la version de sa session.
  const enrollment = await prisma.enrollment.findUnique({
    where: { sessionId_userId: { sessionId, userId: me.id } },
    include: { session: { select: { id: true, isDemo: true, status: true, formationVersionId: true } } },
  });
  if (!enrollment) return { error: "Vous n'êtes pas inscrit à cette session." };
  if (enrollment.session.status === "cancelled") return { error: "Session annulée." };

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, lesson: { module: { formationVersionId: enrollment.session.formationVersionId } } },
  });
  if (!exercise) return { error: "Exercice introuvable." };

  const already = await prisma.submission.findFirst({ where: { exerciseId, userId: me.id, sessionId } });
  if (already) return { error: "Vous avez déjà répondu à cet exercice." };

  const max = exercise.maxScore ?? 1;
  const grade = exercise.correctionMode === "auto" ? gradeAnswer(exercise.type, exercise.config, answer, max) : null;

  await prisma.submission.create({
    data: {
      exerciseId, userId: me.id, sessionId,
      content: { answer, grade: grade ?? null } as unknown as Prisma.InputJsonValue,
      autoScore: grade ? grade.score : null,
      status: grade ? "graded" : "submitted",
      gradedAt: grade ? new Date() : null,
      isDemo: enrollment.session.isDemo,
    },
  });

  revalidatePath(`/espace/sessions/${sessionId}`);
  return undefined;
}

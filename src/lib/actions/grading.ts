"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { canGradeSubmission } from "@/lib/storage/access";
import type { FormState } from "./shared";

const gradeSchema = z.object({
  score: z.number().min(0).max(1000),
  feedback: z.string().trim().max(10_000).default(""),
});

// Correction manuelle : note et retour individuel (spec §8.2, phase 4).
// La soumission n'est jamais réécrite : on complète la note, le retour, la
// date et l'auteur de la correction.
export async function gradeSubmission(submissionId: string, input: { score: number; feedback: string }): Promise<FormState> {
  const me = await requirePermission("can_correct_exercises");
  if (!(await canGradeSubmission(submissionId, me))) return { error: "Cette copie ne relève pas de vos sessions." };

  const parsed = gradeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { exercise: { select: { maxScore: true } } },
  });
  const max = submission.exercise.maxScore ?? 1;
  if (parsed.data.score > max) return { error: `La note ne peut pas dépasser le barème (${max} point(s)).` };

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      manualScore: parsed.data.score,
      feedback: parsed.data.feedback || null,
      status: "graded",
      gradedAt: new Date(),
      gradedById: me.id,
    },
  });

  revalidatePath("/admin/corrections");
  revalidatePath(`/espace/sessions/${submission.sessionId}`);
  return undefined;
}

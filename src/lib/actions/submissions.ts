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

// ── Dépôt de livrables ──────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { createUploadUrl } from "@/lib/storage/client";
import { SUBMISSION_BUCKET, MAX_FILE_BYTES, isAllowedSubmissionType, safeFileName, formatBytes } from "@/lib/storage/config";
import { parseConfig, type FileUploadConfig } from "@/lib/content/exercise-config";

export type UploadTicket = { ok: true; signedUrl: string; token: string; path: string; bucket: string } | { ok: false; error: string };

// Autorisation d'envoi d'un livrable. Le chemin porte session, élève et
// exercice : un livrable est rattaché à celui qui l'a déposé.
export async function requestSubmissionUpload(
  exerciseId: string,
  sessionId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<UploadTicket> {
  const me = await requireUser();

  const enrollment = await prisma.enrollment.findUnique({ where: { sessionId_userId: { sessionId, userId: me.id } } });
  if (!enrollment) return { ok: false, error: "Vous n'êtes pas inscrit à cette session." };

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, type: "file_upload", lesson: { module: { formationVersion: { sessions: { some: { id: sessionId } } } } } },
  });
  if (!exercise) return { ok: false, error: "Exercice introuvable." };

  const already = await prisma.submission.findFirst({ where: { exerciseId, userId: me.id, sessionId } });
  if (already) return { ok: false, error: "Vous avez déjà rendu ce livrable." };

  if (!isAllowedSubmissionType(mimeType)) return { ok: false, error: `Type de fichier non accepté (${mimeType}).` };
  if (sizeBytes <= 0) return { ok: false, error: "Fichier vide." };
  if (sizeBytes > MAX_FILE_BYTES) return { ok: false, error: `Fichier trop lourd (${formatBytes(sizeBytes)}), maximum ${formatBytes(MAX_FILE_BYTES)}.` };

  const path = `sessions/${sessionId}/eleves/${me.id}/${exerciseId}/${randomUUID()}-${safeFileName(fileName)}`;
  try {
    const ticket = await createUploadUrl(path, SUBMISSION_BUCKET);
    return { ok: true, ...ticket, bucket: SUBMISSION_BUCKET };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

// Le nombre de fichiers doit respecter la configuration de l'exercice, et
// chaque chemin doit appartenir à l'élève : on ne référence pas un fichier tiers.
export async function submitFiles(
  exerciseId: string,
  sessionId: string,
  files: { path: string; name: string; mimeType: string; sizeBytes: number }[],
): Promise<SubmitState> {
  const me = await requireUser();
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise || exercise.type !== "file_upload") return { error: "Exercice introuvable." };

  const parsed = parseConfig("file_upload", exercise.config);
  const maxFiles = parsed.success ? (parsed.data as FileUploadConfig).maxFiles : 1;
  if (files.length === 0) return { error: "Ajoutez au moins un fichier." };
  if (files.length > maxFiles) return { error: `Au maximum ${maxFiles} fichier(s).` };

  const prefix = `sessions/${sessionId}/eleves/${me.id}/${exerciseId}/`;
  if (files.some((f) => !f.path.startsWith(prefix))) return { error: "Chemin de fichier invalide." };

  return submitAnswer(exerciseId, sessionId, { kind: "file_upload", files });
}

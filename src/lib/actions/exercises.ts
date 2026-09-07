"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { ExerciseType, CorrectionMode } from "@/generated/prisma/enums";
import { parseConfig, defaultMaxScore, EXERCISE_TYPES, type AnyConfig } from "@/lib/content/exercise-config";
import type { Prisma } from "@/generated/prisma/client";
import type { FormState } from "./shared";

// Les exercices appartiennent au MODÈLE : modifiables sur un brouillon, gelés
// dès publication. Une session évalue avec les exercices figés de sa version.

type Ctx = { lessonId: string; formationId: string; versionNumber: number };

async function loadDraftLesson(lessonId: string, me: CurrentUser): Promise<Ctx> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { formationVersion: { include: { formation: true } } } } },
  });
  if (!lesson) throw new Error("Leçon introuvable");
  const v = lesson.module.formationVersion;
  assertOwnerOrSupervisor(me, v.formation.ownerId);
  if (v.formation.archivedAt) throw new Error("Formation archivée");
  if (v.status !== "draft") throw new Error("Version publiée : ses exercices sont gelés");
  return { lessonId, formationId: v.formationId, versionNumber: v.versionNumber };
}

async function loadDraftExercise(exerciseId: string, me: CurrentUser) {
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise?.lessonId) throw new Error("Exercice introuvable");
  return { exercise, ctx: await loadDraftLesson(exercise.lessonId, me) };
}

function revalidate(ctx: Ctx) {
  revalidatePath(`/admin/formations/${ctx.formationId}/lecons/${ctx.lessonId}`);
  revalidatePath(`/admin/formations/${ctx.formationId}`);
}

const baseSchema = z.object({
  type: z.nativeEnum(ExerciseType),
  title: z.string().trim().min(1, "Le titre est obligatoire"),
  statement: z.string().trim().min(1, "L'énoncé est obligatoire"),
  correctionMode: z.nativeEnum(CorrectionMode),
  maxScore: z.number().int().min(0).max(1000).nullable(),
  config: z.unknown(),
});

export type ExerciseInput = z.infer<typeof baseSchema>;

// Valide le tronc commun puis la configuration propre au type.
function validate(input: unknown): { ok: true; data: ExerciseInput & { config: AnyConfig } } | { ok: false; state: FormState } {
  const base = baseSchema.safeParse(input);
  if (!base.success) {
    const issue = base.error.issues[0];
    return { ok: false, state: { error: issue.message, fieldErrors: { [String(issue.path[0] ?? "_")]: [issue.message] } } };
  }
  const config = parseConfig(base.data.type, base.data.config);
  if (!config.success) {
    return { ok: false, state: { error: config.error.issues[0].message, fieldErrors: { config: [config.error.issues[0].message] } } };
  }
  // Un type à correction automatique ne peut pas être basculé en manuel,
  // sauf la réponse courte qui accepte les deux (spec §8.2).
  const meta = EXERCISE_TYPES[base.data.type];
  const correctionMode = meta.canBeManual ? base.data.correctionMode : meta.correction;
  return { ok: true, data: { ...base.data, correctionMode, config: config.data as AnyConfig } };
}

export async function createExercise(lessonId: string, input: unknown): Promise<FormState> {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftLesson(lessonId, me);
  const parsed = validate(input);
  if (!parsed.ok) return parsed.state;
  const { type, title, statement, correctionMode, maxScore, config } = parsed.data;

  const last = await prisma.exercise.findFirst({ where: { lessonId }, orderBy: { order: "desc" } });
  await prisma.exercise.create({
    data: {
      lessonId, order: (last?.order ?? 0) + 1, type, title, statement, correctionMode,
      maxScore: maxScore ?? defaultMaxScore(type, config),
      config: config as Prisma.InputJsonValue,
    },
  });
  revalidate(ctx);
  redirect(`/admin/formations/${ctx.formationId}/lecons/${lessonId}`);
}

export async function updateExercise(exerciseId: string, input: unknown): Promise<FormState> {
  const me = await requirePermission("can_edit_formation");
  const { exercise, ctx } = await loadDraftExercise(exerciseId, me);
  const parsed = validate(input);
  if (!parsed.ok) return parsed.state;
  const { type, title, statement, correctionMode, maxScore, config } = parsed.data;

  await prisma.exercise.update({
    where: { id: exercise.id },
    data: { type, title, statement, correctionMode, maxScore: maxScore ?? defaultMaxScore(type, config), config: config as Prisma.InputJsonValue },
  });
  revalidate(ctx);
  redirect(`/admin/formations/${ctx.formationId}/lecons/${ctx.lessonId}`);
}

// Brouillon : aucune soumission ne peut exister, suppression physique acceptable.
export async function removeExercise(exerciseId: string) {
  const me = await requirePermission("can_edit_formation");
  const { exercise, ctx } = await loadDraftExercise(exerciseId, me);
  const submissions = await prisma.submission.count({ where: { exerciseId } });
  if (submissions > 0) throw new Error("Des élèves ont déjà répondu : cet exercice ne peut plus être supprimé.");

  await prisma.$transaction(async (tx) => {
    await tx.exercise.delete({ where: { id: exercise.id } });
    const rest = await tx.exercise.findMany({ where: { lessonId: exercise.lessonId! }, orderBy: { order: "asc" } });
    for (let i = 0; i < rest.length; i++) await tx.exercise.update({ where: { id: rest[i].id }, data: { order: -(i + 1) } });
    for (let i = 0; i < rest.length; i++) await tx.exercise.update({ where: { id: rest[i].id }, data: { order: i + 1 } });
  });
  revalidate(ctx);
}

export async function moveExercise(exerciseId: string, direction: "up" | "down") {
  const me = await requirePermission("can_edit_formation");
  const { exercise, ctx } = await loadDraftExercise(exerciseId, me);
  const siblings = await prisma.exercise.findMany({ where: { lessonId: exercise.lessonId! }, orderBy: { order: "asc" } });
  const i = siblings.findIndex((e) => e.id === exercise.id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  const [a, b] = [siblings[i], siblings[j]];
  await prisma.$transaction([
    prisma.exercise.update({ where: { id: a.id }, data: { order: -1 } }),
    prisma.exercise.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.exercise.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);
  revalidate(ctx);
}

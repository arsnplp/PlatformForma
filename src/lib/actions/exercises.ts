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
//
// Un exercice pend soit à une leçon (il suit son contenu), soit à un module
// (évaluation de fin de module). Les deux cas partagent tout sauf leur point
// d'attache, d'où cette notion de « cible ».

export type ExerciseTarget = { lessonId: string; moduleId?: never } | { moduleId: string; lessonId?: never };

type Ctx = {
  target: ExerciseTarget;
  formationId: string;
  versionNumber: number;
  /// Page qui liste les exercices de cette cible : là où l'on retourne.
  back: string;
};

// Filtre Prisma des exercices frères, c'est-à-dire ceux de la même cible.
function siblingWhere(target: ExerciseTarget): Prisma.ExerciseWhereInput {
  return target.lessonId ? { lessonId: target.lessonId } : { moduleId: target.moduleId };
}

async function loadDraftTarget(target: ExerciseTarget, me: CurrentUser): Promise<Ctx> {
  const parentModule = target.lessonId
    ? (await prisma.lesson.findUnique({
        where: { id: target.lessonId },
        include: { module: { include: { formationVersion: { include: { formation: true } } } } },
      }))?.module
    : await prisma.module.findUnique({
        where: { id: target.moduleId },
        include: { formationVersion: { include: { formation: true } } },
      });
  if (!parentModule) throw new Error(target.lessonId ? "Leçon introuvable" : "Module introuvable");

  const v = parentModule.formationVersion;
  assertOwnerOrSupervisor(me, v.formation.ownerId);
  if (v.formation.archivedAt) throw new Error("Formation archivée");
  if (v.status !== "draft") throw new Error("Version publiée : ses exercices sont gelés");

  return {
    target,
    formationId: v.formationId,
    versionNumber: v.versionNumber,
    back: target.lessonId
      ? `/admin/formations/${v.formationId}/lecons/${target.lessonId}`
      : `/admin/formations/${v.formationId}?v=${v.versionNumber}&tab=content`,
  };
}

async function loadDraftExercise(exerciseId: string, me: CurrentUser) {
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) throw new Error("Exercice introuvable");
  const target: ExerciseTarget = exercise.lessonId
    ? { lessonId: exercise.lessonId }
    : exercise.moduleId
      ? { moduleId: exercise.moduleId }
      : (() => { throw new Error("Exercice orphelin"); })();
  return { exercise, ctx: await loadDraftTarget(target, me) };
}

function revalidate(ctx: Ctx) {
  if (ctx.target.lessonId) revalidatePath(`/admin/formations/${ctx.formationId}/lecons/${ctx.target.lessonId}`);
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

export async function createExercise(target: ExerciseTarget, input: unknown): Promise<FormState> {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftTarget(target, me);
  const parsed = validate(input);
  if (!parsed.ok) return parsed.state;
  const { type, title, statement, correctionMode, maxScore, config } = parsed.data;

  const last = await prisma.exercise.findFirst({ where: siblingWhere(target), orderBy: { order: "desc" } });
  await prisma.exercise.create({
    data: {
      lessonId: target.lessonId ?? null,
      moduleId: target.moduleId ?? null,
      order: (last?.order ?? 0) + 1,
      type, title, statement, correctionMode,
      maxScore: maxScore ?? defaultMaxScore(type, config),
      config: config as Prisma.InputJsonValue,
    },
  });
  revalidate(ctx);
  redirect(ctx.back);
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
  redirect(ctx.back);
}

// Brouillon : aucune soumission ne peut exister, suppression physique acceptable.
export async function removeExercise(exerciseId: string) {
  const me = await requirePermission("can_edit_formation");
  const { exercise, ctx } = await loadDraftExercise(exerciseId, me);
  const submissions = await prisma.submission.count({ where: { exerciseId } });
  if (submissions > 0) throw new Error("Des élèves ont déjà répondu : cet exercice ne peut plus être supprimé.");

  const where = siblingWhere(ctx.target);
  await prisma.$transaction(async (tx) => {
    await tx.exercise.delete({ where: { id: exercise.id } });
    const rest = await tx.exercise.findMany({ where, orderBy: { order: "asc" } });
    for (let i = 0; i < rest.length; i++) await tx.exercise.update({ where: { id: rest[i].id }, data: { order: -(i + 1) } });
    for (let i = 0; i < rest.length; i++) await tx.exercise.update({ where: { id: rest[i].id }, data: { order: i + 1 } });
  });
  revalidate(ctx);
}

export async function moveExercise(exerciseId: string, direction: "up" | "down") {
  const me = await requirePermission("can_edit_formation");
  const { exercise, ctx } = await loadDraftExercise(exerciseId, me);
  const siblings = await prisma.exercise.findMany({ where: siblingWhere(ctx.target), orderBy: { order: "asc" } });
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

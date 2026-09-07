"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import type { Prisma } from "@/generated/prisma/client";

// Les blocs appartiennent au MODÈLE : éditables tant que la version est en
// brouillon, gelés dès publication. Une session lit le contenu figé de sa version.

type LessonContext = { lessonId: string; formationId: string; versionNumber: number };

async function loadDraftLesson(lessonId: string, me: CurrentUser): Promise<LessonContext> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { formationVersion: { include: { formation: true } } } } },
  });
  if (!lesson) throw new Error("Leçon introuvable");
  const version = lesson.module.formationVersion;
  assertOwnerOrSupervisor(me, version.formation.ownerId);
  if (version.formation.archivedAt) throw new Error("Formation archivée");
  if (version.status !== "draft") throw new Error("Version publiée : son contenu est gelé");
  return { lessonId, formationId: version.formationId, versionNumber: version.versionNumber };
}

async function loadDraftBlock(blockId: string, me: CurrentUser) {
  const block = await prisma.contentBlock.findUnique({ where: { id: blockId } });
  if (!block) throw new Error("Bloc introuvable");
  return { block, ctx: await loadDraftLesson(block.lessonId, me) };
}

function revalidate(ctx: LessonContext) {
  revalidatePath(`/admin/formations/${ctx.formationId}/lecons/${ctx.lessonId}`);
  revalidatePath(`/admin/formations/${ctx.formationId}`);
}

const markdownOf = (payload: Prisma.JsonValue): string => {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).markdown;
    if (typeof value === "string") return value;
  }
  return "";
};

// Décale par le haut pour respecter l'unicité (lessonId, order).
async function shiftFrom(tx: Prisma.TransactionClient, lessonId: string, fromOrder: number) {
  const toShift = await tx.contentBlock.findMany({ where: { lessonId, order: { gte: fromOrder } }, orderBy: { order: "desc" } });
  for (const b of toShift) await tx.contentBlock.update({ where: { id: b.id }, data: { order: b.order + 1 } });
}

// Renumérote 1..n après suppression.
async function resequence(tx: Prisma.TransactionClient, lessonId: string) {
  const blocks = await tx.contentBlock.findMany({ where: { lessonId }, orderBy: { order: "asc" } });
  for (let i = 0; i < blocks.length; i++) await tx.contentBlock.update({ where: { id: blocks[i].id }, data: { order: -(i + 1) } });
  for (let i = 0; i < blocks.length; i++) await tx.contentBlock.update({ where: { id: blocks[i].id }, data: { order: i + 1 } });
}

export async function addBlock(lessonId: string, afterOrder: number | null, markdown: string) {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftLesson(lessonId, me);
  const at = afterOrder === null
    ? ((await prisma.contentBlock.findFirst({ where: { lessonId }, orderBy: { order: "desc" } }))?.order ?? 0) + 1
    : afterOrder + 1;

  const created = await prisma.$transaction(async (tx) => {
    await shiftFrom(tx, lessonId, at);
    return tx.contentBlock.create({ data: { lessonId, order: at, type: "text", payload: { markdown } } });
  });
  revalidate(ctx);
  return { id: created.id };
}

const updateSchema = z.object({ markdown: z.string().max(50_000, "Bloc trop long") });

export async function updateBlock(blockId: string, markdown: string) {
  const me = await requirePermission("can_edit_formation");
  const { block, ctx } = await loadDraftBlock(blockId, me);
  const parsed = updateSchema.safeParse({ markdown });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.contentBlock.update({ where: { id: block.id }, data: { payload: { markdown: parsed.data.markdown } } });
  revalidate(ctx);
  return { ok: true };
}

export async function duplicateBlock(blockId: string) {
  const me = await requirePermission("can_edit_formation");
  const { block, ctx } = await loadDraftBlock(blockId, me);
  await prisma.$transaction(async (tx) => {
    await shiftFrom(tx, block.lessonId, block.order + 1);
    await tx.contentBlock.create({
      data: { lessonId: block.lessonId, order: block.order + 1, type: block.type, payload: { markdown: markdownOf(block.payload) } },
    });
  });
  revalidate(ctx);
}

// Brouillon = modèle en construction, jamais vécu : suppression physique acceptable.
export async function removeBlock(blockId: string) {
  const me = await requirePermission("can_edit_formation");
  const { block, ctx } = await loadDraftBlock(blockId, me);
  await prisma.$transaction(async (tx) => {
    await tx.contentBlock.delete({ where: { id: block.id } });
    await resequence(tx, block.lessonId);
  });
  revalidate(ctx);
}

// Réordonnancement complet (glisser-déposer) : on reçoit l'ordre voulu.
export async function reorderBlocks(lessonId: string, orderedIds: string[]) {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftLesson(lessonId, me);
  const existing = await prisma.contentBlock.findMany({ where: { lessonId }, select: { id: true } });
  const known = new Set(existing.map((b) => b.id));
  if (orderedIds.length !== existing.length || orderedIds.some((id) => !known.has(id))) {
    throw new Error("Ordre invalide");
  }
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) await tx.contentBlock.update({ where: { id: orderedIds[i] }, data: { order: -(i + 1) } });
    for (let i = 0; i < orderedIds.length; i++) await tx.contentBlock.update({ where: { id: orderedIds[i] }, data: { order: i + 1 } });
  });
  revalidate(ctx);
}

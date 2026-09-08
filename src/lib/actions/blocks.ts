"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { blockScope, blockOwner, targetOf, type BlockTarget } from "@/lib/content/block-target";
import type { Prisma } from "@/generated/prisma/client";

// Les blocs appartiennent au MODÈLE : éditables tant que la version est en
// brouillon, gelés dès publication. Une session lit le contenu figé de sa version.
//
// Une pile de blocs vit soit dans une leçon, soit en introduction de la version.
// Tout ce qui suit est commun aux deux : seul le point d'attache diffère.

type BlockContext = { target: BlockTarget; formationId: string; versionNumber: number };

async function loadDraftTarget(target: BlockTarget, me: CurrentUser): Promise<BlockContext> {
  const version = target.lessonId
    ? (await prisma.lesson.findUnique({
        where: { id: target.lessonId },
        include: { module: { include: { formationVersion: { include: { formation: true } } } } },
      }))?.module.formationVersion
    : await prisma.formationVersion.findUnique({
        where: { id: target.formationVersionId },
        include: { formation: true },
      });
  if (!version) throw new Error(target.lessonId ? "Leçon introuvable" : "Version introuvable");

  assertOwnerOrSupervisor(me, version.formation.ownerId);
  if (version.formation.archivedAt) throw new Error("Formation archivée");
  if (version.status !== "draft") throw new Error("Version publiée : son contenu est gelé");
  return { target, formationId: version.formationId, versionNumber: version.versionNumber };
}

async function loadDraftBlock(blockId: string, me: CurrentUser) {
  const block = await prisma.contentBlock.findUnique({ where: { id: blockId } });
  if (!block) throw new Error("Bloc introuvable");
  return { block, ctx: await loadDraftTarget(targetOf(block), me) };
}

function revalidate(ctx: BlockContext) {
  if (ctx.target.lessonId) revalidatePath(`/admin/formations/${ctx.formationId}/lecons/${ctx.target.lessonId}`);
  revalidatePath(`/admin/formations/${ctx.formationId}`);
}

const markdownOf = (payload: Prisma.JsonValue): string => {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).markdown;
    if (typeof value === "string") return value;
  }
  return "";
};

// Décale par le haut pour respecter l'unicité (cible, order).
async function shiftFrom(tx: Prisma.TransactionClient, target: BlockTarget, fromOrder: number) {
  const toShift = await tx.contentBlock.findMany({
    where: { ...blockScope(target), order: { gte: fromOrder } },
    orderBy: { order: "desc" },
  });
  for (const b of toShift) await tx.contentBlock.update({ where: { id: b.id }, data: { order: b.order + 1 } });
}

// Renumérote 1..n après suppression.
async function resequence(tx: Prisma.TransactionClient, target: BlockTarget) {
  const blocks = await tx.contentBlock.findMany({ where: blockScope(target), orderBy: { order: "asc" } });
  for (let i = 0; i < blocks.length; i++) await tx.contentBlock.update({ where: { id: blocks[i].id }, data: { order: -(i + 1) } });
  for (let i = 0; i < blocks.length; i++) await tx.contentBlock.update({ where: { id: blocks[i].id }, data: { order: i + 1 } });
}

// Rang du prochain bloc : à la suite, ou juste après celui qu'on désigne.
async function nextOrder(target: BlockTarget, afterOrder: number | null): Promise<number> {
  if (afterOrder !== null) return afterOrder + 1;
  const last = await prisma.contentBlock.findFirst({ where: blockScope(target), orderBy: { order: "desc" } });
  return (last?.order ?? 0) + 1;
}

export async function addBlock(target: BlockTarget, afterOrder: number | null, markdown: string) {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftTarget(target, me);
  const at = await nextOrder(target, afterOrder);

  const created = await prisma.$transaction(async (tx) => {
    await shiftFrom(tx, target, at);
    return tx.contentBlock.create({ data: { ...blockOwner(target), order: at, type: "text", payload: { markdown } } });
  });
  revalidate(ctx);
  return { id: created.id };
}

const visioSchema = z.object({
  title: z.string().trim().min(1, "Intitulé requis").max(160),
  durationMinutes: z.number().int().min(5, "5 minutes minimum").max(600, "10 heures maximum"),
  note: z.string().trim().max(500).optional(),
});

// Bloc « séance en classe virtuelle » : il porte le modèle de la séance.
// Sa date et son lien se renseignent session par session (voir Seance), parce
// qu'une même version de formation sert plusieurs sessions.
export async function addVisioBlock(
  target: BlockTarget,
  afterOrder: number | null,
  input: { title: string; durationMinutes: number; note?: string },
) {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftTarget(target, me);
  const parsed = visioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const at = await nextOrder(target, afterOrder);

  const created = await prisma.$transaction(async (tx) => {
    await shiftFrom(tx, target, at);
    return tx.contentBlock.create({ data: { ...blockOwner(target), order: at, type: "visio", payload: parsed.data } });
  });
  revalidate(ctx);
  return { id: created.id };
}

export async function updateVisioBlock(
  blockId: string,
  input: { title: string; durationMinutes: number; note?: string },
) {
  const me = await requirePermission("can_edit_formation");
  const { block, ctx } = await loadDraftBlock(blockId, me);
  if (block.type !== "visio") return { error: "Ce bloc n'est pas une séance." };
  const parsed = visioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.contentBlock.update({ where: { id: block.id }, data: { payload: parsed.data } });
  revalidate(ctx);
  return { ok: true };
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
  const target = targetOf(block);
  await prisma.$transaction(async (tx) => {
    await shiftFrom(tx, target, block.order + 1);
    await tx.contentBlock.create({
      data: { ...blockOwner(target), order: block.order + 1, type: block.type, payload: { markdown: markdownOf(block.payload) } },
    });
  });
  revalidate(ctx);
}

// Brouillon = modèle en construction, jamais vécu : suppression physique acceptable.
export async function removeBlock(blockId: string) {
  const me = await requirePermission("can_edit_formation");
  const { block, ctx } = await loadDraftBlock(blockId, me);
  // Une séance déjà planifiée sur une session a pu être émargée : c'est du vécu.
  const planned = await prisma.seance.count({ where: { contentBlockId: blockId } });
  if (planned > 0) throw new Error("Cette séance est planifiée sur une session : elle ne peut plus être retirée");
  await prisma.$transaction(async (tx) => {
    await tx.contentBlock.delete({ where: { id: block.id } });
    await resequence(tx, ctx.target);
  });
  revalidate(ctx);
}

// Réordonnancement complet (glisser-déposer) : on reçoit l'ordre voulu.
export async function reorderBlocks(target: BlockTarget, orderedIds: string[]) {
  const me = await requirePermission("can_edit_formation");
  const ctx = await loadDraftTarget(target, me);
  const existing = await prisma.contentBlock.findMany({ where: blockScope(target), select: { id: true } });
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

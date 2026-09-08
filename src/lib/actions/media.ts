"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { checkBlockTargetEdit, checkBlockFileAccess } from "@/lib/storage/access";
import { createUploadUrl, removeFile } from "@/lib/storage/client";
import { MAX_FILE_BYTES, kindOf, safeFileName, formatBytes } from "@/lib/storage/config";
import { parseEmbedUrl, readFile } from "@/lib/content/block-payload";
import { blockScope, blockOwner, targetOf, type BlockTarget } from "@/lib/content/block-target";
import type { ContentBlockType } from "@/generated/prisma/enums";

// Le fichier ne transite jamais par le serveur applicatif : le navigateur
// l'envoie directement à Supabase avec une autorisation à usage unique.
// Cela évite de charger 50 Mo en mémoire à chaque envoi.

export type UploadTicket = { ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string };

export async function requestUpload(target: BlockTarget, fileName: string, mimeType: string, sizeBytes: number): Promise<UploadTicket> {
  const me = await requirePermission("can_edit_formation");
  if (!(await checkBlockTargetEdit(target, me))) return { ok: false, error: "Contenu non modifiable." };

  const kind = kindOf(mimeType);
  if (!kind) return { ok: false, error: `Type de fichier non accepté (${mimeType}).` };
  if (sizeBytes <= 0) return { ok: false, error: "Fichier vide." };
  if (sizeBytes > MAX_FILE_BYTES) return { ok: false, error: `Fichier trop lourd (${formatBytes(sizeBytes)}), maximum ${formatBytes(MAX_FILE_BYTES)}.` };

  const versionId = target.lessonId
    ? (await prisma.lesson.findUniqueOrThrow({
        where: { id: target.lessonId },
        select: { module: { select: { formationVersionId: true } } },
      })).module.formationVersionId
    : target.formationVersionId;
  // Le chemin porte la version : un fichier appartient au contenu d'une version.
  // Le second segment dit dans quelle pile il vit — une leçon, ou l'introduction.
  const path = `versions/${versionId}/${target.lessonId ?? "introduction"}/${randomUUID()}-${safeFileName(fileName)}`;

  try {
    const ticket = await createUploadUrl(path);
    return { ok: true, ...ticket };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

// Une fois le fichier déposé, on crée le bloc qui le référence.
export async function attachUploadedFile(
  target: BlockTarget,
  afterOrder: number | null,
  file: { path: string; name: string; mimeType: string; sizeBytes: number; alt?: string; caption?: string },
) {
  const me = await requirePermission("can_edit_formation");
  if (!(await checkBlockTargetEdit(target, me))) throw new Error("Contenu non modifiable.");
  const kind = kindOf(file.mimeType);
  if (!kind) throw new Error("Type de fichier non accepté.");
  const segment = target.lessonId ?? "introduction";
  if (!file.path.startsWith(`versions/`) || !file.path.includes(`/${segment}/`)) throw new Error("Chemin de fichier invalide.");

  const type: ContentBlockType =
    kind === "image" ? "image" : kind === "pdf" ? "pdf" : kind === "video" ? "video" : "file";
  const at = afterOrder === null
    ? ((await prisma.contentBlock.findFirst({ where: blockScope(target), orderBy: { order: "desc" } }))?.order ?? 0) + 1
    : afterOrder + 1;

  const created = await prisma.$transaction(async (tx) => {
    const toShift = await tx.contentBlock.findMany({ where: { ...blockScope(target), order: { gte: at } }, orderBy: { order: "desc" } });
    for (const b of toShift) await tx.contentBlock.update({ where: { id: b.id }, data: { order: b.order + 1 } });
    return tx.contentBlock.create({
      data: {
        ...blockOwner(target), order: at, type,
        payload: { path: file.path, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, alt: file.alt ?? "", caption: file.caption ?? "" },
      },
    });
  });
  revalidatePath(`/admin/formations`);
  return { id: created.id };
}

// Vidéo hébergée ailleurs (YouTube, Vimeo) : rien à stocker.
export async function addEmbedBlock(target: BlockTarget, afterOrder: number | null, rawUrl: string) {
  const me = await requirePermission("can_edit_formation");
  if (!(await checkBlockTargetEdit(target, me))) throw new Error("Contenu non modifiable.");
  const embed = parseEmbedUrl(rawUrl);
  if (!embed) return { error: "Lien non reconnu. Seuls YouTube et Vimeo sont acceptés." };

  const at = afterOrder === null
    ? ((await prisma.contentBlock.findFirst({ where: blockScope(target), orderBy: { order: "desc" } }))?.order ?? 0) + 1
    : afterOrder + 1;

  await prisma.$transaction(async (tx) => {
    const toShift = await tx.contentBlock.findMany({ where: { ...blockScope(target), order: { gte: at } }, orderBy: { order: "desc" } });
    for (const b of toShift) await tx.contentBlock.update({ where: { id: b.id }, data: { order: b.order + 1 } });
    await tx.contentBlock.create({ data: { ...blockOwner(target), order: at, type: "embed", payload: { ...embed } } });
  });
  return { ok: true };
}

// Légende et texte alternatif d'un bloc média.
export async function updateMediaMeta(blockId: string, meta: { alt?: string; caption?: string }) {
  const me = await requirePermission("can_edit_formation");
  const access = await checkBlockFileAccess(blockId, me);
  if (!access.allowed || !access.canEdit) throw new Error("Bloc non modifiable.");
  const block = await prisma.contentBlock.findUniqueOrThrow({ where: { id: blockId } });
  const current = readFile(block.payload);
  if (!current) return;
  await prisma.contentBlock.update({
    where: { id: blockId },
    data: { payload: { ...current, alt: meta.alt ?? current.alt ?? "", caption: meta.caption ?? current.caption ?? "" } },
  });
}

// Supprimer un bloc média retire aussi le fichier du stockage : sur un
// brouillon, ce contenu n'a jamais été vécu par un élève.
export async function removeMediaBlock(blockId: string) {
  const me = await requirePermission("can_edit_formation");
  const access = await checkBlockFileAccess(blockId, me);
  if (!access.allowed || !access.canEdit) throw new Error("Bloc non modifiable.");
  const block = await prisma.contentBlock.findUniqueOrThrow({ where: { id: blockId } });
  const file = readFile(block.payload);

  const scope = blockScope(targetOf(block));
  await prisma.$transaction(async (tx) => {
    await tx.contentBlock.delete({ where: { id: blockId } });
    const rest = await tx.contentBlock.findMany({ where: scope, orderBy: { order: "asc" } });
    for (let i = 0; i < rest.length; i++) await tx.contentBlock.update({ where: { id: rest[i].id }, data: { order: -(i + 1) } });
    for (let i = 0; i < rest.length; i++) await tx.contentBlock.update({ where: { id: rest[i].id }, data: { order: i + 1 } });
  });

  // Le fichier n'est retiré que s'il n'est référencé par aucun autre bloc
  // (une duplication de bloc partage le même chemin).
  if (file) {
    const stillUsed = await prisma.contentBlock.count({ where: { payload: { path: ["path"], equals: file.path } } });
    if (stillUsed === 0) await removeFile(file.path);
  }
}

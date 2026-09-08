"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { checkSlotAccess } from "@/lib/queries/slots";
import { createUploadUrl, removeFile } from "@/lib/storage/client";
import {
  DOCUMENT_BUCKET, MAX_FILE_BYTES, isAllowedDocumentType, safeFileName, formatBytes,
} from "@/lib/storage/config";
import { DocumentSlotKind, DocumentType } from "@/generated/prisma/enums";
import { PHASE_NUMBERS } from "@/lib/labels";
import { requestSignature } from "./signature";

// ═══════════════════════════════════════════════════════════════════════════
// LES CARRÉS DE L'ESPACE COMMUN
//
// Un carré à fournir naît vide : le titulaire le remplit. Un carré à signer
// naît avec sa pièce : le titulaire la signe. Dans les deux cas, il reste
// « en attente » tant que le geste attendu n'a pas eu lieu — c'est la pièce
// qui fait foi, jamais un statut recopié.
// ═══════════════════════════════════════════════════════════════════════════

export type SlotState = { error?: string } | undefined;
export type SlotUploadTicket = { ok: true; signedUrl: string; token: string; path: string; bucket: string } | { ok: false; error: string };

export type SlotHolder = { userId: string; sessionId: string; companyId?: never } | { companyId: string; userId?: never; sessionId?: never };

const inputSchema = z.object({
  kind: z.nativeEnum(DocumentSlotKind),
  title: z.string().trim().min(1, "Donne un nom à ce document").max(200),
  instructions: z.string().trim().max(2_000).optional(),
  documentType: z.nativeEnum(DocumentType).default("autre"),
  phase: z.number().int().refine((n) => PHASE_NUMBERS.includes(n), "Phase inconnue").nullable().optional(),
  dueDate: z.string().optional(),
});

export type SlotInput = z.input<typeof inputSchema>;

// Le créateur doit être maître du dossier visé : sa session, son entreprise.
async function assertCanManage(holder: SlotHolder, me: CurrentUser) {
  if (canSupervise(me)) return;
  if (holder.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: holder.sessionId },
      select: { ownerId: true, trainerId: true },
    });
    if (!session || (session.ownerId !== me.id && session.trainerId !== me.id)) throw new Error("Session introuvable");
    return;
  }
  const company = await prisma.company.findUnique({ where: { id: holder.companyId }, select: { ownerId: true } });
  if (!company || company.ownerId !== me.id) throw new Error("Entreprise introuvable");
}

// Un élève ne reçoit un carré que dans une session où il est inscrit.
async function assertHolderInScope(holder: SlotHolder) {
  if (!holder.userId) return;
  const enrolled = await prisma.enrollment.count({ where: { sessionId: holder.sessionId, userId: holder.userId } });
  if (!enrolled) throw new Error("Cet élève n'est pas inscrit à cette session");
}

function revalidateHolder(holder: { userId: string | null; sessionId: string | null; companyId: string | null }) {
  if (holder.userId) {
    revalidatePath(`/admin/eleves/${holder.userId}`);
    if (holder.sessionId) revalidatePath(`/espace/sessions/${holder.sessionId}/documents`);
  }
  if (holder.sessionId) revalidatePath(`/admin/sessions/${holder.sessionId}`);
  if (holder.companyId) revalidatePath(`/admin/entreprises/${holder.companyId}`);
}

export async function createSlot(holder: SlotHolder, input: SlotInput): Promise<SlotState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await assertCanManage(holder, me);
    await assertHolderInScope(holder);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Création refusée." };
  }

  const last = await prisma.documentSlot.findFirst({
    where: holder.userId ? { userId: holder.userId, sessionId: holder.sessionId } : { companyId: holder.companyId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.documentSlot.create({
    data: {
      kind: parsed.data.kind,
      title: parsed.data.title,
      instructions: parsed.data.instructions || null,
      documentType: parsed.data.documentType,
      phase: parsed.data.phase ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      order: (last?.order ?? 0) + 1,
      userId: holder.userId ?? null,
      sessionId: holder.sessionId ?? null,
      companyId: holder.companyId ?? null,
      createdById: me.id,
    },
  });

  revalidateHolder({ userId: holder.userId ?? null, sessionId: holder.sessionId ?? null, companyId: holder.companyId ?? null });
  return undefined;
}

// Autorisation d'envoi dans un carré. Le chemin est calculé ici : le client ne
// choisit jamais où le fichier atterrit.
export async function requestSlotUpload(
  slotId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<SlotUploadTicket> {
  const me = await requireUser();
  const access = await checkSlotAccess(slotId, me);
  if (!access.allowed) return { ok: false, error: "Emplacement introuvable." };

  const slot = await prisma.documentSlot.findUniqueOrThrow({
    where: { id: slotId },
    select: { kind: true, documentId: true, archivedAt: true, userId: true, sessionId: true, companyId: true, documentType: true, phase: true },
  });
  if (slot.archivedAt) return { ok: false, error: "Cette demande a été retirée." };
  if (slot.documentId) return { ok: false, error: "Cet emplacement contient déjà une pièce." };
  // Le titulaire fournit ; c'est l'encadrement qui pose une pièce à signer.
  if (slot.kind === "to_provide" && access.role !== "holder" && access.role !== "staff") {
    return { ok: false, error: "Dépôt refusé." };
  }
  if (slot.kind === "to_sign" && access.role !== "staff") {
    return { ok: false, error: "Seul le formateur pose une pièce à signer." };
  }

  if (!isAllowedDocumentType(mimeType)) return { ok: false, error: `Type de fichier non accepté (${mimeType}).` };
  if (sizeBytes <= 0) return { ok: false, error: "Fichier vide." };
  if (sizeBytes > MAX_FILE_BYTES) {
    return { ok: false, error: `Fichier trop lourd (${formatBytes(sizeBytes)}), maximum ${formatBytes(MAX_FILE_BYTES)}.` };
  }

  const path = slotPath(slot, slotId, fileName);
  try {
    const ticket = await createUploadUrl(path, DOCUMENT_BUCKET);
    return { ok: true, ...ticket, bucket: DOCUMENT_BUCKET };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

function slotPath(
  slot: { userId: string | null; sessionId: string | null; companyId: string | null; documentType: DocumentType; phase: number | null },
  slotId: string,
  fileName: string,
): string {
  const phase = `p${slot.phase ?? 0}`;
  const file = `${randomUUID()}-${safeFileName(fileName)}`;
  if (slot.sessionId && slot.userId) {
    return `sessions/${slot.sessionId}/eleves/${slot.userId}/${phase}/${slot.documentType}/${slotId}/${file}`;
  }
  return `entreprises/${slot.companyId}/${phase}/${slot.documentType}/${slotId}/${file}`;
}

// Le fichier déposé devient une pièce du dossier, rattachée au carré.
// Une pièce à signer part aussitôt en signature : c'est le geste attendu.
export async function fillSlot(
  slotId: string,
  file: { path: string; mimeType: string; sizeBytes: number },
): Promise<SlotState> {
  const me = await requireUser();
  const access = await checkSlotAccess(slotId, me);
  if (!access.allowed) return { error: "Emplacement introuvable." };

  const slot = await prisma.documentSlot.findUniqueOrThrow({
    where: { id: slotId },
    select: {
      kind: true, title: true, documentId: true, archivedAt: true,
      userId: true, sessionId: true, companyId: true, documentType: true, phase: true,
    },
  });
  if (slot.archivedAt) return { error: "Cette demande a été retirée." };
  if (slot.documentId) return { error: "Cet emplacement contient déjà une pièce." };
  if (slot.kind === "to_sign" && access.role !== "staff") return { error: "Seul le formateur pose une pièce à signer." };
  if (!isAllowedDocumentType(file.mimeType)) return { error: "Type de fichier non accepté." };

  // Le chemin doit être celui qu'on a délivré : on ne rattache pas un fichier
  // arbitraire du bucket, fût-il déjà présent.
  const prefix = slot.sessionId && slot.userId
    ? `sessions/${slot.sessionId}/eleves/${slot.userId}/`
    : `entreprises/${slot.companyId}/`;
  if (!file.path.startsWith(prefix) || !file.path.includes(`/${slotId}/`)) return { error: "Chemin de fichier invalide." };

  const session = slot.sessionId
    ? await prisma.session.findUnique({ where: { id: slot.sessionId }, select: { isDemo: true } })
    : null;

  const document = await prisma.document.create({
    data: {
      ownerUserId: slot.userId,
      companyId: slot.companyId,
      sessionId: slot.sessionId,
      type: slot.documentType,
      phase: slot.phase,
      title: slot.title,
      storagePath: file.path,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      uploadedById: me.id,
      isDemo: session?.isDemo ?? false,
    },
  });
  await prisma.documentSlot.update({ where: { id: slotId }, data: { documentId: document.id } });

  // Une pièce posée dans un carré « à signer » n'a d'intérêt qu'une fois la
  // demande partie : on l'enchaîne, plutôt que d'exiger un second clic.
  if (slot.kind === "to_sign") {
    const outcome = await requestSignature(document.id);
    if (!outcome.ok) {
      revalidateHolder(slot);
      return { error: `Pièce déposée, mais la signature n'a pas pu être demandée : ${outcome.message}` };
    }
  }

  revalidateHolder(slot);
  return undefined;
}

// Retirer la pièce d'un carré : le carré redevient vide, la demande tient.
// Impossible dès qu'une signature est engagée — c'est du vécu.
export async function clearSlot(slotId: string): Promise<void> {
  const me = await requirePermission("can_manage_sessions");
  const access = await checkSlotAccess(slotId, me);
  if (!access.allowed || access.role !== "staff") throw new Error("Emplacement introuvable");

  const slot = await prisma.documentSlot.findUniqueOrThrow({
    where: { id: slotId },
    select: { documentId: true, userId: true, sessionId: true, companyId: true },
  });
  if (!slot.documentId) return;

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: slot.documentId },
    select: { signatureStatus: true, storagePath: true },
  });
  if (document.signatureStatus !== "na") throw new Error("Pièce engagée dans une signature : elle ne peut plus être retirée");

  await prisma.documentSlot.update({ where: { id: slotId }, data: { documentId: null } });
  await removeFile(document.storagePath, DOCUMENT_BUCKET);
  await prisma.document.update({ where: { id: slot.documentId }, data: { archivedAt: new Date() } });
  revalidateHolder(slot);
}

// Retrait d'une demande devenue sans objet. La pièce déjà déposée, elle, reste
// au dossier : elle a été vécue.
export async function archiveSlot(slotId: string): Promise<void> {
  const me = await requirePermission("can_manage_sessions");
  const access = await checkSlotAccess(slotId, me);
  if (!access.allowed || access.role !== "staff") throw new Error("Emplacement introuvable");

  const slot = await prisma.documentSlot.findUniqueOrThrow({
    where: { id: slotId },
    select: { userId: true, sessionId: true, companyId: true },
  });
  await prisma.documentSlot.update({ where: { id: slotId }, data: { archivedAt: new Date() } });
  revalidateHolder(slot);
}

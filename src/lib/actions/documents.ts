"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { canManageDocument } from "@/lib/storage/access";
import { createUploadUrl, removeFile } from "@/lib/storage/client";
import {
  DOCUMENT_BUCKET, MAX_FILE_BYTES, isAllowedDocumentType, safeFileName, formatBytes,
} from "@/lib/storage/config";
import { DocumentType } from "@/generated/prisma/enums";
import { PHASE_NUMBERS } from "@/lib/labels";

export type UploadTicket = { ok: true; signedUrl: string; token: string; path: string; bucket: string } | { ok: false; error: string };
export type DocumentState = { error?: string } | undefined;

// ═══════════════════════════════════════════════════════════════════════════
// Une pièce a EXACTEMENT un titulaire : un élève, ou une entreprise.
// La base le garantit (contrainte documents_one_holder) ; ici on vérifie en
// plus que le déposant a le droit d'écrire dans ce dossier-là.
// ═══════════════════════════════════════════════════════════════════════════

const targetSchema = z
  .object({
    ownerUserId: z.string().uuid().nullable().optional(),
    companyId: z.string().uuid().nullable().optional(),
    sessionId: z.string().uuid().nullable().optional(),
    formationId: z.string().uuid().nullable().optional(),
    // Le classement n'est plus demandé au dépôt : une pièce se retrouve par son
    // intitulé et son dossier, pas par une taxonomie à remplir à la main.
    type: z.nativeEnum(DocumentType).default("autre"),
    phase: z.number().int().refine((n) => PHASE_NUMBERS.includes(n), "Phase inconnue").nullable().optional(),
    title: z.string().trim().min(1, "Titre requis").max(200),
  })
  .refine((d) => Boolean(d.ownerUserId) !== Boolean(d.companyId), {
    message: "Une pièce appartient soit à un élève, soit à une entreprise.",
    path: ["ownerUserId"],
  });

export type DocumentTarget = z.infer<typeof targetSchema>;
/// Ce que l'appelant fournit : le classement, lui, est rempli par défaut.
export type DocumentTargetInput = z.input<typeof targetSchema>;

// Le déposant doit être maître du dossier visé : session qu'il possède ou
// anime, entreprise ou formation qui lui appartient.
async function assertCanFile(target: DocumentTarget, me: CurrentUser) {
  if (canSupervise(me)) return;

  if (target.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: target.sessionId },
      select: { ownerId: true, trainerId: true },
    });
    if (!session || (session.ownerId !== me.id && session.trainerId !== me.id)) {
      throw new Error("Session introuvable");
    }
    return;
  }
  if (target.companyId) {
    const company = await prisma.company.findUnique({ where: { id: target.companyId }, select: { ownerId: true } });
    if (!company || company.ownerId !== me.id) throw new Error("Entreprise introuvable");
    return;
  }
  if (target.formationId) {
    const formation = await prisma.formation.findUnique({ where: { id: target.formationId }, select: { ownerId: true } });
    if (!formation || formation.ownerId !== me.id) throw new Error("Formation introuvable");
    return;
  }
  throw new Error("Une pièce doit être rattachée à une session, une entreprise ou une formation.");
}

// Un élève ne reçoit une pièce que dans une session qu'on gère, sinon on
// pourrait déposer dans le dossier de l'élève d'un autre formateur.
async function assertHolderInScope(target: DocumentTarget) {
  if (!target.ownerUserId) return;
  if (!target.sessionId) throw new Error("Une pièce d'élève est toujours rattachée à une session.");
  const enrolled = await prisma.enrollment.count({
    where: { sessionId: target.sessionId, userId: target.ownerUserId },
  });
  if (!enrolled) throw new Error("Cet élève n'est pas inscrit à cette session");
}

// Autorisation d'envoi. Le chemin dit à qui appartient la pièce et où elle se
// range : il est calculé côté serveur, jamais fourni par le client.
export async function requestDocumentUpload(
  target: DocumentTargetInput,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<UploadTicket> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = targetSchema.safeParse(target);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await assertCanFile(parsed.data, me);
    await assertHolderInScope(parsed.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Dépôt refusé." };
  }

  if (!isAllowedDocumentType(mimeType)) return { ok: false, error: `Type de fichier non accepté (${mimeType}).` };
  if (sizeBytes <= 0) return { ok: false, error: "Fichier vide." };
  if (sizeBytes > MAX_FILE_BYTES) {
    return { ok: false, error: `Fichier trop lourd (${formatBytes(sizeBytes)}), maximum ${formatBytes(MAX_FILE_BYTES)}.` };
  }

  const path = documentPath(parsed.data, fileName);
  try {
    const ticket = await createUploadUrl(path, DOCUMENT_BUCKET);
    return { ok: true, ...ticket, bucket: DOCUMENT_BUCKET };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

function documentPath(target: DocumentTarget, fileName: string): string {
  const phase = `p${target.phase ?? 0}`;
  const file = `${randomUUID()}-${safeFileName(fileName)}`;
  if (target.sessionId && target.ownerUserId) {
    return `sessions/${target.sessionId}/eleves/${target.ownerUserId}/${phase}/${target.type}/${file}`;
  }
  if (target.sessionId) return `sessions/${target.sessionId}/entreprise/${phase}/${target.type}/${file}`;
  if (target.companyId) return `entreprises/${target.companyId}/${phase}/${target.type}/${file}`;
  return `formations/${target.formationId}/${target.type}/${file}`;
}

// Enregistrement de la pièce, une fois le fichier envoyé. Le chemin doit être
// celui qu'on a calculé : on ne référence pas un fichier arbitraire du bucket.
export async function createDocument(
  target: DocumentTargetInput,
  file: { path: string; mimeType: string; sizeBytes: number },
): Promise<DocumentState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = targetSchema.safeParse(target);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await assertCanFile(parsed.data, me);
    await assertHolderInScope(parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Dépôt refusé." };
  }

  const expectedPrefix = parsed.data.sessionId && parsed.data.ownerUserId
    ? `sessions/${parsed.data.sessionId}/eleves/${parsed.data.ownerUserId}/`
    : parsed.data.sessionId
      ? `sessions/${parsed.data.sessionId}/entreprise/`
      : parsed.data.companyId
        ? `entreprises/${parsed.data.companyId}/`
        : `formations/${parsed.data.formationId}/`;
  if (!file.path.startsWith(expectedPrefix)) return { error: "Chemin de fichier invalide." };
  if (!isAllowedDocumentType(file.mimeType)) return { error: "Type de fichier non accepté." };

  // Une pièce de session hérite du caractère démonstratif de la session.
  const session = parsed.data.sessionId
    ? await prisma.session.findUnique({ where: { id: parsed.data.sessionId }, select: { isDemo: true } })
    : null;

  await prisma.document.create({
    data: {
      ownerUserId: parsed.data.ownerUserId ?? null,
      companyId: parsed.data.companyId ?? null,
      sessionId: parsed.data.sessionId ?? null,
      formationId: parsed.data.formationId ?? null,
      type: parsed.data.type,
      phase: parsed.data.phase ?? null,
      title: parsed.data.title,
      storagePath: file.path,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      uploadedById: me.id,
      isDemo: session?.isDemo ?? false,
    },
  });

  revalidateDocumentViews(parsed.data);
  return undefined;
}

// Retrait d'un dépôt erroné. Impossible dès qu'une signature est engagée :
// une pièce signée est du vécu, elle ne bouge plus.
// Les refus lèvent : le bouton n'est proposé que sur une pièce retirable, donc
// un refus signale une manipulation ou une course, pas une erreur de saisie.
export async function archiveDocument(documentId: string): Promise<void> {
  const me = await requirePermission("can_manage_sessions");
  if (!(await canManageDocument(documentId, me))) throw new Error("Pièce introuvable");

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { signatureStatus: true, storagePath: true, archivedAt: true, ownerUserId: true, companyId: true, sessionId: true, formationId: true },
  });
  if (document.archivedAt) return;
  if (document.signatureStatus !== "na") {
    throw new Error("Pièce engagée dans une signature : elle ne peut plus être retirée");
  }

  // Le fichier part du stockage, la ligne reste : la trace du dépôt et de son
  // retrait est elle-même une information d'audit.
  await removeFile(document.storagePath, DOCUMENT_BUCKET);
  await prisma.document.update({ where: { id: documentId }, data: { archivedAt: new Date() } });

  revalidateDocumentViews(document);
}

function revalidateDocumentViews(target: {
  ownerUserId?: string | null; companyId?: string | null; sessionId?: string | null; formationId?: string | null;
}) {
  if (target.ownerUserId) revalidatePath(`/admin/eleves/${target.ownerUserId}`);
  if (target.companyId) revalidatePath(`/admin/entreprises/${target.companyId}`);
  if (target.sessionId) {
    revalidatePath(`/admin/sessions/${target.sessionId}`);
    revalidatePath(`/espace/sessions/${target.sessionId}/documents`);
  }
  if (target.formationId) revalidatePath(`/admin/formations/${target.formationId}`);
  revalidatePath("/espace");
}

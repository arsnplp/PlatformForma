"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { getSessionPlan } from "@/lib/queries/plan";
import { buildPlanPdf } from "@/lib/export/plan-pdf";
import { uploadFile } from "@/lib/storage/client";
import { DOCUMENT_BUCKET } from "@/lib/storage/config";

export type PlanState = { ok: boolean; message: string };

// Le plan devient une PIÈCE DE SESSION : il entre donc dans le dossier de
// preuve sans code d'export supplémentaire, et l'élève le retrouve dans ses
// documents. Un plan régénéré remplace le précédent.
export async function generateSessionPlan(sessionId: string): Promise<PlanState> {
  const me = await requirePermission("can_manage_sessions");
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, name: true, isDemo: true, ownerId: true, trainerId: true },
  });
  if (!session) return { ok: false, message: "Session introuvable." };
  if (!canSupervise(me) && session.ownerId !== me.id && session.trainerId !== me.id) {
    return { ok: false, message: "Session introuvable." };
  }

  const plan = await getSessionPlan(sessionId);
  const pdf = await buildPlanPdf(plan);
  const path = `sessions/${sessionId}/plan/${randomUUID()}-plan-de-formation.pdf`;
  if (!(await uploadFile(path, pdf, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" }))) {
    return { ok: false, message: "Enregistrement du plan impossible." };
  }

  // Un seul plan courant par session : l'ancien est retiré du dossier.
  await prisma.document.updateMany({
    where: { sessionId, type: "autre", title: { startsWith: "Plan de formation" }, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  await prisma.document.create({
    data: {
      sessionId, type: "autre", phase: 1,
      title: `Plan de formation — ${session.name}`,
      storagePath: path, mimeType: "application/pdf", sizeBytes: pdf.byteLength,
      uploadedById: me.id, isDemo: session.isDemo,
    },
  });

  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/espace/sessions/${sessionId}/plan`);
  return { ok: true, message: "Plan de formation ajouté au dossier de la session." };
}

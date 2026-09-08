"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { getStudentSessionTime } from "@/lib/queries/time";
import { rebuildTimeAggregates } from "@/lib/activity/rebuild";
import { buildTimeSheetPdf } from "@/lib/export/time-sheet-pdf";
import { uploadFile } from "@/lib/storage/client";
import { DOCUMENT_BUCKET } from "@/lib/storage/config";

export type TimeSheetState = { ok: boolean; message: string };

// Le relevé devient une pièce du dossier de l'élève, rattachée à sa session :
// il entre donc dans le dossier de preuve sans code d'export supplémentaire,
// et l'élève le retrouve dans ses documents.
export async function generateTimeSheet(sessionId: string, userId: string): Promise<TimeSheetState> {
  const me = await requirePermission("can_manage_sessions");

  const enrollment = await prisma.enrollment.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { session: { select: { ownerId: true, trainerId: true, isDemo: true } }, user: { select: { name: true, email: true } } },
  });
  if (!enrollment) return { ok: false, message: "Élève non inscrit à cette session." };
  if (!canSupervise(me) && enrollment.session.ownerId !== me.id && enrollment.session.trainerId !== me.id) {
    return { ok: false, message: "Session introuvable." };
  }

  // Le relevé dérive toujours des traces brutes : on recalcule les cumuls
  // avant de l'établir, pour qu'aucun écart accidentel ne devienne une preuve.
  await rebuildTimeAggregates(sessionId, userId);
  const report = await getStudentSessionTime(sessionId, userId);
  const pdf = await buildTimeSheetPdf({ report, student: enrollment.user, generatedBy: me.name });

  const path = `sessions/${sessionId}/eleves/${userId}/p5/releve-temps/${randomUUID()}-releve.pdf`;
  if (!(await uploadFile(path, pdf, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" }))) {
    return { ok: false, message: "Enregistrement du relevé impossible." };
  }

  // Un seul relevé courant par élève et par session : le précédent est retiré.
  await prisma.document.updateMany({
    where: { sessionId, ownerUserId: userId, title: { startsWith: "Relevé de temps" }, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  await prisma.document.create({
    data: {
      sessionId, ownerUserId: userId, type: "autre", phase: 5,
      title: `Relevé de temps de connexion — ${enrollment.user.name}`,
      storagePath: path, mimeType: "application/pdf", sizeBytes: pdf.byteLength,
      uploadedById: me.id, isDemo: enrollment.session.isDemo,
    },
  });

  revalidatePath(`/admin/eleves/${userId}`);
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/espace/sessions/${sessionId}/documents`);
  return { ok: true, message: "Relevé ajouté au dossier de l'élève." };
}

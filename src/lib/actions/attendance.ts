"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { uploadFile } from "@/lib/storage/client";
import { DOCUMENT_BUCKET } from "@/lib/storage/config";
import { buildAttendanceSheet, buildAttendanceCertificate, type CertificateLine } from "@/lib/attendance/sheet";
import { readVisio } from "@/lib/content/block-payload";
import { createMultiSignatureRequest, createSignatureRequest, getSignatureRequest, downloadSignedPdf, remindSigners, hasSigned, isCompleted } from "@/lib/signature/signwell";
import { resolveSigner } from "@/lib/signature/config";

export type AttendanceState = { ok: boolean; message: string };

const openSchema = z.object({
  seanceId: z.string().uuid(),
  presentUserIds: z.array(z.string().uuid()),
});

// L'encadrement de la session, seul habilité à tenir l'émargement.
async function loadManagedSession(sessionId: string, me: CurrentUser) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true, name: true, status: true, isDemo: true, startDate: true, endDate: true, durationHours: true,
      company: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      formationVersion: { select: { formation: { select: { name: true } } } },
      enrollments: {
        where: { status: { in: ["active", "completed"] } },
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });
  if (!session) throw new Error("Session introuvable");
  const staff = session.trainer ?? session.owner;
  if (!canSupervise(me) && session.owner.id !== me.id && session.trainer?.id !== me.id) {
    throw new Error("Session introuvable");
  }
  return { session, staff };
}

// Ouvre l'émargement d'une SÉANCE : on fige qui est présent, on génère la
// feuille et on lance la signature. Ce sont les séances de visio qui définissent
// les feuilles — douze visios, douze émargements. Un absent n'est jamais
// signataire, ce qui évite qu'une feuille reste bloquée.
export async function openSeance(input: z.input<typeof openSchema>): Promise<AttendanceState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { seanceId, presentUserIds } = parsed.data;

  const seance = await prisma.seance.findUnique({
    where: { id: seanceId },
    select: { id: true, sessionId: true, startsAt: true, durationMinutes: true, contentBlock: { select: { payload: true } } },
  });
  if (!seance) return { ok: false, message: "Séance introuvable." };

  const { session, staff } = await loadManagedSession(seance.sessionId, me);
  if (session.status === "cancelled") return { ok: false, message: "Session annulée." };
  if (!staff) return { ok: false, message: "La session n'a pas de formateur." };

  const already = await prisma.attendance.findFirst({ where: { seanceId } });
  if (already) return { ok: false, message: "L'émargement de cette séance est déjà ouvert." };

  const enrolled = session.enrollments.map((e) => e.user);
  const present = enrolled.filter((u) => presentUserIds.includes(u.id));
  if (present.length === 0) return { ok: false, message: "Aucun présent : rien à faire signer." };

  const visio = readVisio(seance.contentBlock.payload);
  const seanceTitle = visio?.title ?? "Séance";
  // Jour civil de la séance, pour le classement et l'audit.
  const day = new Date(Date.UTC(seance.startsAt.getUTCFullYear(), seance.startsAt.getUTCMonth(), seance.startsAt.getUTCDate()));
  const slot = seance.startsAt.getUTCHours() < 12 ? "am" : "pm";

  const { pdf, zones } = await buildAttendanceSheet({
    formationName: session.formationVersion.formation.name,
    sessionName: session.name,
    companyName: session.company?.name ?? null,
    seanceTitle,
    startsAt: seance.startsAt,
    durationMinutes: seance.durationMinutes,
    trainerName: staff.name,
    durationHours: session.durationHours,
    participants: present.map((u) => ({ userId: u.id, name: u.name, email: u.email })),
  });

  const dayIso = day.toISOString().slice(0, 10);
  const title = `Émargement — ${seanceTitle} — ${dayIso}`;
  const path = `sessions/${seance.sessionId}/emargements/${seanceId}/${randomUUID()}-emargement.pdf`;
  if (!(await uploadFile(path, pdf, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" }))) {
    return { ok: false, message: "Enregistrement de la feuille impossible." };
  }

  // La feuille appartient à la session, pas à un élève : elle porte tout le groupe.
  const document = await prisma.document.create({
    data: {
      sessionId: seance.sessionId, companyId: null, ownerUserId: null,
      type: "emargement", phase: 4, title,
      storagePath: path, mimeType: "application/pdf", sizeBytes: pdf.byteLength,
      uploadedById: me.id, isDemo: session.isDemo,
    },
  });

  await prisma.attendance.createMany({
    data: enrolled.map((u) => ({
      sessionId: seance.sessionId, seanceId, userId: u.id, day, slot: slot as "am" | "pm",
      status: presentUserIds.includes(u.id) ? ("present" as const) : ("absent" as const),
      documentId: presentUserIds.includes(u.id) ? document.id : null,
    })),
  });

  // Session de démonstration : aucun appel au prestataire, aucun quota consommé.
  if (session.isDemo) {
    revalidateAttendance(seance.sessionId);
    return { ok: true, message: `Émargement ouvert pour ${present.length} présent(s) — session de démonstration, signatures simulées.` };
  }

  // La clé de sous-adressage rend les signataires distincts en mode test, où
  // toutes les adresses pointent vers la même boîte.
  const signers = [
    ...present.map((u) => ({ key: u.id, ...resolveSigner({ name: u.name, email: u.email }, u.id) })),
    { key: "trainer", ...resolveSigner({ name: staff.name, email: staff.email }, "formateur") },
  ];
  const result = await createMultiSignatureRequest({
    title, fileName: "emargement.pdf", file: pdf, zones,
    message: "Merci de signer votre présence pour cette séance.",
    signers: signers.map((s) => ({ key: s.key, name: s.name, email: s.email })),
  });
  if (!result.ok) {
    revalidateAttendance(seance.sessionId);
    return { ok: false, message: result.error };
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { signatureStatus: "pending", signatureProviderId: result.document.id },
  });

  revalidateAttendance(seance.sessionId);
  return { ok: true, message: `Émargement ouvert : ${present.length} présent(s) + le formateur à signer.` };
}

// Envoi (ou renvoi) des demandes de signature d'une séance déjà ouverte.
// Sert quand l'appel au prestataire a échoué : la feuille et les présences sont
// déjà au dossier, il ne reste qu'à relancer la demande. La feuille est
// régénérée à l'identique, donc les zones de signature retombent au même endroit.
export async function requestSeanceSignature(documentId: string): Promise<AttendanceState> {
  const me = await requirePermission("can_manage_sessions");
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, sessionId: true, title: true, storagePath: true, signatureProviderId: true, isDemo: true },
  });
  if (!document?.sessionId) return { ok: false, message: "Feuille introuvable." };
  if (document.signatureProviderId) return { ok: false, message: "Les demandes sont déjà parties." };
  if (document.isDemo) return { ok: false, message: "Session de démonstration : aucune signature réelle." };

  const { session, staff } = await loadManagedSession(document.sessionId, me);
  if (!staff) return { ok: false, message: "La session n'a pas de formateur." };

  const rows = await prisma.attendance.findMany({
    where: { documentId, status: { in: ["present", "signed"] } },
    include: { user: { select: { id: true, name: true, email: true } }, seance: { include: { contentBlock: true } } },
    orderBy: { user: { name: "asc" } },
  });
  if (rows.length === 0) return { ok: false, message: "Aucun présent sur cette séance." };
  const seance = rows[0].seance;
  if (!seance) return { ok: false, message: "Séance introuvable." };

  const { pdf, zones } = await buildAttendanceSheet({
    formationName: session.formationVersion.formation.name,
    sessionName: session.name,
    companyName: session.company?.name ?? null,
    seanceTitle: readVisio(seance.contentBlock.payload)?.title ?? "Séance",
    startsAt: seance.startsAt,
    durationMinutes: seance.durationMinutes,
    trainerName: staff.name,
    durationHours: session.durationHours,
    participants: rows.map((r) => ({ userId: r.user.id, name: r.user.name, email: r.user.email })),
  });
  await uploadFile(document.storagePath, pdf, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" });

  const signers = [
    ...rows.map((r) => ({ key: r.user.id, ...resolveSigner({ name: r.user.name, email: r.user.email }, r.user.id) })),
    { key: "trainer", ...resolveSigner({ name: staff.name, email: staff.email }, "formateur") },
  ];
  const result = await createMultiSignatureRequest({
    title: document.title, fileName: "emargement.pdf", file: pdf, zones,
    message: "Merci de signer votre présence pour cette séance.",
    signers: signers.map((s) => ({ key: s.key, name: s.name, email: s.email })),
  });
  if (!result.ok) return { ok: false, message: result.error };

  await prisma.document.update({
    where: { id: documentId },
    data: { signatureStatus: "pending", signatureProviderId: result.document.id, sizeBytes: pdf.byteLength },
  });
  revalidateAttendance(document.sessionId);
  return { ok: true, message: `Demandes de signature envoyées à ${rows.length} présent(s) et au formateur.` };
}

// Lien de signature d'UNE personne pour SA demi-journée.
export async function getAttendanceSigningUrl(attendanceId: string): Promise<{ url: string } | { error: string }> {
  const me = await requireUser();
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: {
      userId: true, status: true, signedAt: true,
      session: { select: { isDemo: true, ownerId: true, trainerId: true } },
      document: { select: { signatureProviderId: true } },
    },
  });
  if (!attendance) return { error: "Séance introuvable." };

  const isStaff = canSupervise(me) || attendance.session.ownerId === me.id || attendance.session.trainerId === me.id;
  if (attendance.userId !== me.id && !isStaff) return { error: "Demi-journée introuvable." };
  if (attendance.signedAt) return { error: "Déjà signée." };
  if (attendance.status !== "present") return { error: "Cette séance n'est pas à signer." };
  if (!attendance.document?.signatureProviderId) return { error: "Aucune demande de signature." };

  const remote = await getSignatureRequest(attendance.document.signatureProviderId);
  const recipient = remote?.recipients?.find((r) => r.id === attendance.userId);
  if (!recipient?.embedded_signing_url) return { error: "Lien de signature indisponible." };
  return { url: recipient.embedded_signing_url };
}

// Signature du formateur sur sa propre ligne.
export async function getTrainerSigningUrl(documentId: string): Promise<{ url: string } | { error: string }> {
  const me = await requirePermission("can_manage_sessions");
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { signatureProviderId: true, session: { select: { ownerId: true, trainerId: true } } },
  });
  if (!document?.signatureProviderId) return { error: "Aucune demande de signature." };
  const isStaff = canSupervise(me) || document.session?.ownerId === me.id || document.session?.trainerId === me.id;
  if (!isStaff) return { error: "Feuille introuvable." };

  const remote = await getSignatureRequest(document.signatureProviderId);
  const recipient = remote?.recipients?.find((r) => r.id === "trainer");
  if (!recipient?.embedded_signing_url) return { error: "Lien de signature indisponible." };
  return { url: recipient.embedded_signing_url };
}

// Reprise des signatures auprès de SignWell : qui a signé, et si la feuille est
// complète, récupération du PDF signé avec sa page de preuve.
export async function refreshSeance(documentId: string): Promise<AttendanceState> {
  const me = await requireUser();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true, sessionId: true, storagePath: true, signatureProviderId: true, signatureStatus: true, isDemo: true,
      session: { select: { ownerId: true, trainerId: true } },
    },
  });
  if (!document) return { ok: false, message: "Feuille introuvable." };

  const enrolled = await prisma.attendance.count({ where: { documentId, userId: me.id } });
  const isStaff = canSupervise(me) || document.session?.ownerId === me.id || document.session?.trainerId === me.id;
  if (!isStaff && enrolled === 0) return { ok: false, message: "Feuille introuvable." };

  if (document.isDemo || !document.signatureProviderId) {
    return { ok: true, message: "Session de démonstration : aucune signature réelle." };
  }

  const remote = await getSignatureRequest(document.signatureProviderId);
  if (!remote) return { ok: false, message: "Demande introuvable chez le prestataire." };

  let signed = 0;
  for (const recipient of remote.recipients) {
    if (!hasSigned(recipient.status) || recipient.id === "trainer") continue;
    const updated = await prisma.attendance.updateMany({
      where: { documentId, userId: recipient.id, signedAt: null },
      data: { status: "signed", signedAt: new Date() },
    });
    signed += updated.count;
  }

  if (isCompleted(remote.status) && document.signatureStatus !== "signed") {
    const pdf = await downloadSignedPdf(document.signatureProviderId);
    if (pdf) {
      const signedPath = document.storagePath.replace(/\.pdf$/i, "") + "-signe.pdf";
      if (await uploadFile(signedPath, pdf, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" })) {
        await prisma.document.update({
          where: { id: documentId },
          data: { signatureStatus: "signed", signedAt: new Date(), storagePath: signedPath, sizeBytes: pdf.byteLength },
        });
      }
    }
  }

  if (document.sessionId) revalidateAttendance(document.sessionId);
  return { ok: true, message: signed > 0 ? `${signed} signature(s) enregistrée(s).` : `Statut à jour (${remote.status}).` };
}

// Signature simulée, réservée aux sessions de démonstration.
export async function signDemoAttendance(attendanceId: string): Promise<AttendanceState> {
  const me = await requireUser();
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { userId: true, sessionId: true, status: true, session: { select: { isDemo: true } } },
  });
  if (!attendance || attendance.userId !== me.id) return { ok: false, message: "Séance introuvable." };
  if (!attendance.session.isDemo) return { ok: false, message: "Cette session exige une signature réelle." };
  if (attendance.status !== "present") return { ok: false, message: "Rien à signer." };

  await prisma.attendance.update({ where: { id: attendanceId }, data: { status: "signed", signedAt: new Date() } });
  revalidateAttendance(attendance.sessionId);
  return { ok: true, message: "Présence enregistrée (démonstration)." };
}

export async function remindSeance(documentId: string): Promise<AttendanceState> {
  const me = await requirePermission("can_manage_sessions");
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { signatureProviderId: true, isDemo: true, session: { select: { ownerId: true, trainerId: true } } },
  });
  if (!document) return { ok: false, message: "Feuille introuvable." };
  const isStaff = canSupervise(me) || document.session?.ownerId === me.id || document.session?.trainerId === me.id;
  if (!isStaff) return { ok: false, message: "Feuille introuvable." };
  if (document.isDemo || !document.signatureProviderId) return { ok: false, message: "Aucune signature réelle à relancer." };

  const sent = await remindSigners(document.signatureProviderId);
  return sent
    ? { ok: true, message: "Relance envoyée aux signataires en retard." }
    : { ok: false, message: "Relance impossible pour l'instant." };
}

// Clôture d'une séance que des retardataires laissent en attente.
// On ne peut pas retirer un signataire chez SignWell : on acte donc côté
// dossier qui a signé, et on marque les autres « présent, signature non
// recueillie ». La feuille garde les signatures déjà recueillies.
export async function closeSeance(documentId: string): Promise<AttendanceState> {
  const me = await requirePermission("can_manage_sessions");
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, sessionId: true, session: { select: { ownerId: true, trainerId: true } } },
  });
  if (!document) return { ok: false, message: "Feuille introuvable." };
  const isStaff = canSupervise(me) || document.session?.ownerId === me.id || document.session?.trainerId === me.id;
  if (!isStaff) return { ok: false, message: "Feuille introuvable." };

  await refreshSeance(documentId);
  const closed = await prisma.attendance.updateMany({
    where: { documentId, status: "present", signedAt: null },
    data: { status: "unsigned" },
  });

  if (closed.count === 0) {
    if (document.sessionId) revalidateAttendance(document.sessionId);
    return { ok: true, message: "Séance close : tout le monde avait signé." };
  }

  // Des présents n'ont pas signé : le formateur atteste lui-même des présences,
  // et cette attestation vient compléter le dossier à côté de la feuille.
  const certificate = await issueAttendanceCertificate(documentId, me);
  if (document.sessionId) revalidateAttendance(document.sessionId);
  return {
    ok: true,
    message: `Séance close : ${closed.count} présent(s) sans signature recueillie. ${certificate}`,
  };
}

// Attestation de la demi-journée, signée par le seul formateur : mono-signataire,
// donc toujours complétable, contrairement à la feuille de groupe restée en attente.
async function issueAttendanceCertificate(documentId: string, me: CurrentUser): Promise<string> {
  const sheet = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { sessionId: true, isDemo: true },
  });
  if (!sheet.sessionId) return "";

  const rows = await prisma.attendance.findMany({
    where: { documentId },
    include: { user: { select: { name: true } }, seance: { include: { contentBlock: true } } },
    orderBy: { user: { name: "asc" } },
  });
  if (rows.length === 0) return "";
  const seance = rows[0].seance;
  if (!seance) return "";
  const absent = await prisma.attendance.findMany({
    where: { seanceId: seance.id, status: "absent" },
    include: { user: { select: { name: true } } },
  });

  const { session, staff } = await loadManagedSession(sheet.sessionId, me);
  if (!staff) return "";

  const lines: CertificateLine[] = [
    ...rows.map((r) => ({
      name: r.user.name,
      state: (r.status === "signed" ? "signed" : "unsigned") as CertificateLine["state"],
      signedAt: r.signedAt,
    })),
    ...absent.map((r) => ({ name: r.user.name, state: "absent" as const, signedAt: null })),
  ];

  const seanceTitle = readVisio(seance.contentBlock.payload)?.title ?? "Séance";
  const { pdf, zone } = await buildAttendanceCertificate({
    formationName: session.formationVersion.formation.name,
    sessionName: session.name,
    companyName: session.company?.name ?? null,
    seanceTitle,
    startsAt: seance.startsAt,
    durationMinutes: seance.durationMinutes,
    trainerName: staff.name,
    durationHours: session.durationHours,
    participants: [],
    lines,
  });

  const dayIso = seance.startsAt.toISOString().slice(0, 10);
  const title = `Attestation de présence — ${seanceTitle} — ${dayIso}`;
  const path = `sessions/${sheet.sessionId}/emargements/${seance.id}/${randomUUID()}-attestation.pdf`;
  if (!(await uploadFile(path, pdf, { bucket: DOCUMENT_BUCKET, contentType: "application/pdf" }))) {
    return "Attestation non enregistrée.";
  }

  const document = await prisma.document.create({
    data: {
      sessionId: sheet.sessionId, type: "attestation", phase: 4, title,
      storagePath: path, mimeType: "application/pdf", sizeBytes: pdf.byteLength,
      uploadedById: me.id, isDemo: sheet.isDemo,
    },
  });

  if (sheet.isDemo) return "Attestation du formateur ajoutée au dossier (démonstration, non signée).";

  const signer = resolveSigner({ name: staff.name, email: staff.email }, "formateur");
  const result = await createSignatureRequest({
    title, fileName: "attestation.pdf", file: pdf, signer,
    message: "Attestation de présence à signer pour clore la demi-journée.",
    zone,
  });
  if (!result.ok) return "Attestation ajoutée au dossier, signature à relancer.";

  await prisma.document.update({
    where: { id: document.id },
    data: { signatureStatus: "pending", signatureProviderId: result.document.id },
  });
  return "Attestation du formateur créée : il reste à la signer depuis le dossier documentaire.";
}

function revalidateAttendance(sessionId: string) {
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/espace/sessions/${sessionId}`);
  revalidatePath(`/espace/sessions/${sessionId}/emargements`);
  revalidatePath("/espace");
}

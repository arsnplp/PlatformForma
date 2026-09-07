"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import { parseForm, fieldError, emptyToNull, type FormState } from "./shared";
import { loadOwnedSession } from "./sessions";
import { sendInvitation } from "@/lib/auth/invitation";
import { ensureConversation } from "@/lib/queries/conversations";

// État étendu : après création d'un compte élève, le compte-rendu de
// l'invitation. Aucun mot de passe ne transite ni ne s'affiche : l'élève
// choisit le sien depuis le lien reçu par mail.
export type EnrollState =
  | (NonNullable<FormState> & {
      created?: { userId: string; email: string; invited: boolean; sentTo?: string; sandbox?: boolean; error?: string };
    })
  | undefined;

const enrollSchema = z
  .object({
    userId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    name: z.preprocess(emptyToNull, z.string().trim().nullable()),
    email: z.preprocess(emptyToNull, z.string().trim().toLowerCase().email("Email invalide").nullable()),
  })
  .refine((d) => d.userId || (d.name && d.email), {
    message: "Choisis un élève existant, ou renseigne nom et email pour en créer un",
    path: ["userId"],
  });

// Message volontairement neutre : ne révèle pas si l'email existe chez un autre formateur.
const NEUTRAL_EMAIL_MESSAGE =
  "Inscription impossible avec cet email. Si cet élève est déjà sur la plateforme, demande au super-administrateur de l'inscrire.";

// Cloisonnement : un élève est « à moi » s'il est inscrit à une session que je possède ou que j'anime.
async function isInMyRoster(userId: string, me: CurrentUser) {
  if (canSupervise(me)) return true;
  const n = await prisma.enrollment.count({
    where: { userId, session: { OR: [{ ownerId: me.id }, { trainerId: me.id }] } },
  });
  return n > 0;
}

// De quoi rédiger l'invitation : intitulé de la formation, nom de la session
// et formateur à qui l'élève pourra répondre.
async function invitationContext(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      name: true,
      trainer: { select: { name: true, email: true } },
      owner: { select: { name: true, email: true } },
      formationVersion: { select: { formation: { select: { name: true } } } },
    },
  });
  const trainer = session.trainer ?? session.owner;
  return {
    formationName: session.formationVersion.formation.name,
    sessionName: session.name,
    trainer: { name: trainer.name, email: trainer.email },
  };
}

async function assertEnrollable(sessionId: string, me: Parameters<typeof loadOwnedSession>[1]) {
  const session = await loadOwnedSession(sessionId, me);
  if (session.status === "cancelled") throw new Error("Session annulée : inscription impossible");
  return session;
}

async function enroll(sessionId: string, userId: string) {
  const existing = await prisma.enrollment.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (existing) return { already: true };
  await prisma.enrollment.create({ data: { sessionId, userId } });
  // Un fil de discussion par élève et par session, ouvert dès l'inscription.
  await ensureConversation(sessionId, userId);
  return { already: false };
}

export async function enrollStudent(sessionId: string, _prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const me = await requirePermission("can_manage_sessions");
  await assertEnrollable(sessionId, me);
  const parsed = parseForm(enrollSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { userId, name, email } = parsed.data;

  // 1. Élève existant choisi dans la liste
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId, archivedAt: null } });
    if (!user || !(await isInMyRoster(user.id, me))) return fieldError(formData, "userId", "Élève introuvable");
    const r = await enroll(sessionId, user.id);
    revalidatePath(`/admin/sessions/${sessionId}`);
    return r.already ? fieldError(formData, "userId", "Déjà inscrit à cette session") : undefined;
  }

  // 2. Par email : compte existant → inscription ; sinon création du compte élève
  const byEmail = await prisma.user.findUnique({ where: { email: email! } });
  if (byEmail) {
    // Hors de mon périmètre (élève d'un autre formateur, compte archivé…) : réponse neutre.
    if (byEmail.archivedAt || !(await isInMyRoster(byEmail.id, me))) {
      return fieldError(formData, "email", NEUTRAL_EMAIL_MESSAGE);
    }
    const r = await enroll(sessionId, byEmail.id);
    revalidatePath(`/admin/sessions/${sessionId}`);
    return r.already ? fieldError(formData, "email", "Déjà inscrit à cette session") : undefined;
  }

  // Mot de passe initial aléatoire, jamais affiché ni transmis : il n'existe
  // que pour créer le compte. L'élève pose le sien via le lien d'invitation.
  const initialPassword = randomBytes(24).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email!,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { name },
  });
  // Un compte auth existant sans profil renverrait « already registered » : même réponse neutre.
  if (error) return fieldError(formData, "email", NEUTRAL_EMAIL_MESSAGE);

  const eleve = await prisma.role.findUniqueOrThrow({ where: { key: "eleve" } });
  await prisma.$transaction([
    // Le trigger auth → public.users a créé la ligne ; on la garantit et on pose le nom.
    prisma.user.upsert({
      where: { id: data.user.id },
      create: { id: data.user.id, email: email!, name: name! },
      update: { name: name! },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: data.user.id, roleId: eleve.id } },
      create: { userId: data.user.id, roleId: eleve.id },
      update: {},
    }),
    prisma.enrollment.create({ data: { sessionId, userId: data.user.id } }),
    prisma.conversation.create({ data: { sessionId, userId: data.user.id } }),
  ]);
  const context = await invitationContext(sessionId);
  const invitation = await sendInvitation({
    student: { id: data.user.id, name: name!, email: email! },
    trainer: context.trainer,
    formationName: context.formationName,
    sessionName: context.sessionName,
    actorId: me.id,
  });

  revalidatePath(`/admin/sessions/${sessionId}`);
  return {
    created: invitation.ok
      ? { userId: data.user.id, email: email!, invited: true, sentTo: invitation.sentTo, sandbox: invitation.sandbox }
      : { userId: data.user.id, email: email!, invited: false, error: invitation.error },
  };
}

// Renvoi d'une invitation : lien perdu, expiré, ou envoi qui avait échoué.
// Le compte reste le même, seul un nouveau lien est émis.
export async function resendInvitation(userId: string): Promise<{ ok: boolean; message: string }> {
  const me = await requirePermission("can_manage_sessions");
  const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, archivedAt: true } });
  if (!student || student.archivedAt || !(await isInMyRoster(student.id, me))) {
    throw new Error("Élève introuvable");
  }

  // La session la plus récente sert de contexte au message.
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, session: canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] } },
    orderBy: { enrolledAt: "desc" },
    select: { sessionId: true },
  });
  if (!enrollment) throw new Error("Cet élève n'est inscrit à aucune de vos sessions");

  const context = await invitationContext(enrollment.sessionId);
  const invitation = await sendInvitation({
    student: { id: student.id, name: student.name, email: student.email },
    trainer: context.trainer,
    formationName: context.formationName,
    sessionName: context.sessionName,
    actorId: me.id,
  });

  revalidatePath(`/admin/eleves/${userId}`);
  return invitation.ok
    ? { ok: true, message: `Invitation renvoyée à ${invitation.sentTo}${invitation.sandbox ? " (bac à sable)" : ""}.` }
    : { ok: false, message: invitation.error };
}

// Changement de statut : jamais de suppression (vécu). completed pose completedAt.
export async function setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus) {
  const me = await requirePermission("can_manage_sessions");
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new Error("Inscription introuvable");
  await loadOwnedSession(enrollment.sessionId, me);
  if (!Object.values(EnrollmentStatus).includes(status)) throw new Error("Statut invalide");

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status, completedAt: status === "completed" ? new Date() : null },
  });
  revalidatePath(`/admin/sessions/${enrollment.sessionId}`);
}

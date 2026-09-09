"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";
import { EnrollmentStatus } from "@/generated/prisma/enums";
import { parseForm, fieldError, emptyToNull, type FormState } from "./shared";
import { loadOwnedSession } from "./sessions";
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
    /// Posé à la main quand on crée le compte au passage : c'est le formateur
    /// qui transmet les identifiants.
    password: z.preprocess(emptyToNull, z.string().min(8, "Huit caractères au minimum").max(72).nullable()),
  })
  .refine((d) => d.userId || (d.name && d.email), {
    message: "Choisis un élève existant, ou renseigne nom et email pour en créer un",
    path: ["userId"],
  })
  .refine((d) => d.userId || d.password, {
    message: "Choisis le mot de passe du nouvel élève",
    path: ["password"],
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
  const { userId, name, email, password } = parsed.data;

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

  // Le mot de passe est celui qu'a choisi le formateur : il le transmet
  // lui-même, par le canal qui lui convient.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email!,
    password: password!,
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
  revalidatePath(`/admin/sessions/${sessionId}`);
  return { created: { userId: data.user.id, email: email!, invited: false } };
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

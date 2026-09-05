"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { SessionStatus } from "@/generated/prisma/enums";
import { parseForm, emptyToNull, type FormState } from "./shared";

const sessionSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire"),
    formationVersionId: z.string().uuid("Choisis une formation et une version"),
    companyId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    trainerId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    startDate: z.coerce.date({ message: "Date de début invalide" }),
    endDate: z.coerce.date({ message: "Date de fin invalide" }),
    status: z.nativeEnum(SessionStatus).default("planned"),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "La fin doit être après le début", path: ["endDate"] });

function revalidate(sessionId?: string, formationId?: string) {
  revalidatePath("/admin/sessions");
  if (sessionId) revalidatePath(`/admin/sessions/${sessionId}`);
  if (formationId) revalidatePath(`/admin/formations/${formationId}`);
}

export async function loadOwnedSession(id: string, me: CurrentUser) {
  const session = await prisma.session.findUnique({ where: { id }, include: { formationVersion: true } });
  if (!session) throw new Error("Session introuvable");
  assertOwnerOrSupervisor(me, session.ownerId);
  return session;
}

// Vérifie version publiée + formation active + périmètre ; renvoie le propriétaire à poser sur la session.
async function checkVersion(versionId: string, me: CurrentUser) {
  const version = await prisma.formationVersion.findUnique({ where: { id: versionId }, include: { formation: true } });
  if (!version) throw new Error("Version introuvable");
  assertOwnerOrSupervisor(me, version.formation.ownerId);
  if (version.formation.archivedAt) throw new Error("Formation archivée");
  if (version.status === "draft") throw new Error("Un brouillon ne peut pas recevoir de session : publie-le d'abord");
  return version;
}

async function checkCompany(companyId: string | null, ownerId: string, me: CurrentUser) {
  if (!companyId) return;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.archivedAt) throw new Error("Entreprise introuvable ou archivée");
  // L'entreprise doit être dans le même espace que la session (sauf superviseur).
  if (company.ownerId !== ownerId) assertOwnerOrSupervisor(me, company.ownerId);
}

export async function createSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = parseForm(sessionSchema, formData);
  if (!parsed.ok) return parsed.state;

  const version = await checkVersion(parsed.data.formationVersionId, me);
  const ownerId = version.formation.ownerId; // la session appartient au propriétaire de la formation
  await checkCompany(parsed.data.companyId, ownerId, me);

  // Piège n°3 : la session pointe vers une VERSION précise, figée pour toujours.
  const session = await prisma.session.create({ data: { ...parsed.data, ownerId } });
  revalidate(session.id, version.formationId);
  redirect(`/admin/sessions/${session.id}`);
}

export async function updateSession(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_sessions");
  const current = await loadOwnedSession(id, me);
  const parsed = parseForm(sessionSchema, formData);
  if (!parsed.ok) return parsed.state;

  // La version ne change JAMAIS après création (vécu immuable) : on ignore toute autre valeur.
  const { formationVersionId: _ignored, ...data } = parsed.data;
  void _ignored;
  await checkCompany(data.companyId, current.ownerId, me);

  await prisma.session.update({ where: { id }, data });
  revalidate(id, current.formationVersion.formationId);
  redirect(`/admin/sessions/${id}`);
}

// « Supprimer » une session = la passer en annulée. Jamais de suppression physique.
export async function cancelSession(id: string) {
  const me = await requirePermission("can_manage_sessions");
  const current = await loadOwnedSession(id, me);
  await prisma.session.update({ where: { id }, data: { status: "cancelled" } });
  revalidate(id, current.formationVersion.formationId);
}

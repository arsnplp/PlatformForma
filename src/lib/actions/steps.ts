"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { StepInstanceStatus } from "@/generated/prisma/enums";

// Qui peut agir sur la checklist d'une session : son propriétaire, son formateur
// animateur, ou un superviseur (même règle que app_manages_session côté RLS).
function assertManagesSession(me: CurrentUser, session: { ownerId: string; trainerId: string | null }) {
  if (canSupervise(me) || session.ownerId === me.id || session.trainerId === me.id) return;
  throw new Error("Accès refusé : cette session appartient à un autre formateur");
}

// Cocher (done), passer (skipped) ou rouvrir (pending) une étape.
// done / skipped tracent qui et quand ; rouvrir efface la trace courante.
// La ligne n'est jamais supprimée : la checklist est du vécu.
export async function setStepStatus(instanceId: string, status: StepInstanceStatus) {
  const me = await requirePermission("can_manage_sessions");
  if (!Object.values(StepInstanceStatus).includes(status)) throw new Error("Statut invalide");

  const instance = await prisma.stepInstance.findUnique({
    where: { id: instanceId },
    include: { session: { select: { id: true, ownerId: true, trainerId: true, status: true, formationVersion: { select: { formationId: true } } } } },
  });
  if (!instance) throw new Error("Étape introuvable");
  assertManagesSession(me, instance.session);
  if (instance.session.status === "cancelled") throw new Error("Session annulée : checklist en lecture seule");

  await prisma.stepInstance.update({
    where: { id: instanceId },
    data: status === "pending" ? { status, doneAt: null, doneById: null } : { status, doneAt: new Date(), doneById: me.id },
  });
  revalidatePath(`/admin/sessions/${instance.session.id}`);
  revalidatePath("/admin");
}

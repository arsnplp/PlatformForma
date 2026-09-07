"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { executeStepInstance, type ExecutionReport } from "@/lib/process/execute-step";
import { logAccess } from "@/lib/audit";

export type ExecuteState = { report?: ExecutionReport; error?: string } | undefined;

function assertManagesSession(me: CurrentUser, session: { ownerId: string; trainerId: string | null }) {
  if (canSupervise(me) || session.ownerId === me.id || session.trainerId === me.id) return;
  throw new Error("Accès refusé : cette session appartient à un autre formateur");
}

// « Exécuter maintenant » : déclenche l'action d'une étape à la main.
// Sert à vérifier un mail avant de laisser le cron faire le travail (palier 3 d).
export async function executeStepNow(instanceId: string): Promise<ExecuteState> {
  const me = await requirePermission("can_manage_sessions");
  const instance = await prisma.stepInstance.findUnique({
    where: { id: instanceId },
    include: { session: { select: { id: true, ownerId: true, trainerId: true } } },
  });
  if (!instance) return { error: "Étape introuvable." };
  assertManagesSession(me, instance.session);

  const report = await executeStepInstance(instanceId, me.id);
  await logAccess(me.id, `execute_step:${report.sent} envoi(s)`, "step_instance", instanceId, { dedupMinutes: 0 });

  revalidatePath(`/admin/sessions/${instance.session.id}`);
  revalidatePath("/admin");
  return { report };
}

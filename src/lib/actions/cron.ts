"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runDueSteps, type RunSummary } from "@/lib/process/run-due-steps";
import { runMessageNotifications, type NotificationReport } from "@/lib/notifications/message-notifications";

export type RunState = { summary?: RunSummary; error?: string } | undefined;

// Déclenchement manuel du scan quotidien, pour vérifier avant de laisser
// tourner le cron. Réservé à qui peut générer des données de test / superviser.
export async function runDueStepsNow(dryRun: boolean): Promise<RunState> {
  const me = await requirePermission("can_view_all_dossiers");
  const summary = await runDueSteps({ trigger: "manual", actorId: me.id, dryRun });
  revalidatePath("/admin/envois");
  revalidatePath("/admin");
  return { summary };
}

export type NotifyState = { report?: NotificationReport; error?: string } | undefined;

// Déclenchement manuel de la notification des messages non lus, pour vérifier
// sans attendre le passage automatique.
export async function runMessageNotificationsNow(dryRun: boolean): Promise<NotifyState> {
  await requirePermission("can_view_all_dossiers");
  const report = await runMessageNotifications({ dryRun });
  revalidatePath("/admin/envois");
  return { report };
}

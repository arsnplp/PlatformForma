import "server-only";

import { prisma } from "@/lib/prisma";
import { executeStepInstance } from "./execute-step";
import { todayInParis, parisDateString } from "./today";
import type { ExecutionTrigger } from "@/generated/prisma/enums";

export type RunSummary = {
  date: string;
  candidates: number;
  executed: number;
  sent: number;
  failed: number;
  skipped: number;
  sandbox: boolean;
  items: { stepInstanceId: string; step: string; session: string; status: string; sent: number; failed: number; note?: string }[];
};

// Scanne les étapes d'envoi dues aujourd'hui ou en retard, et les exécute.
//
// Périmètre volontairement étroit :
//   • statut `pending` uniquement → une étape déjà faite n'est jamais renvoyée ;
//   • action `send_message` uniquement ;
//   • sessions planifiées ou en cours, jamais annulées ni terminées ;
//   • jamais les sessions de démonstration ;
//   • échéance ≤ aujourd'hui à Paris (les étapes manuelles et sur événement,
//     qui n'ont pas d'échéance, sont ignorées).
//
// Idempotence : un envoi réussi passe l'étape en `done`, donc un second
// passage le même jour ne la retrouve pas. Une garde supplémentaire ignore
// toute étape ayant déjà une exécution réussie ou partielle le même jour.
export async function runDueSteps(options: { trigger: ExecutionTrigger; actorId?: string | null; dryRun?: boolean } = { trigger: "cron" }): Promise<RunSummary> {
  const today = todayInParis();
  const date = parisDateString();

  const due = await prisma.stepInstance.findMany({
    where: {
      status: "pending",
      dueDate: { not: null, lte: today },
      stepTemplate: { actionType: "send_message" },
      session: { isDemo: false, status: { in: ["planned", "running"] } },
    },
    include: {
      stepTemplate: { select: { name: true } },
      session: { select: { name: true } },
    },
    orderBy: [{ dueDate: "asc" }],
  });

  const summary: RunSummary = { date, candidates: due.length, executed: 0, sent: 0, failed: 0, skipped: 0, sandbox: true, items: [] };

  for (const instance of due) {
    // Déjà exécutée avec succès aujourd'hui : on ne renvoie pas.
    const already = await prisma.stepExecution.count({
      where: { stepInstanceId: instance.id, status: { in: ["success", "partial"] }, at: { gte: today } },
    });
    if (already > 0) {
      summary.skipped++;
      summary.items.push({ stepInstanceId: instance.id, step: instance.stepTemplate.name, session: instance.session.name, status: "skipped", sent: 0, failed: 0, note: "Déjà exécutée aujourd'hui" });
      continue;
    }

    if (options.dryRun) {
      summary.items.push({ stepInstanceId: instance.id, step: instance.stepTemplate.name, session: instance.session.name, status: "dry-run", sent: 0, failed: 0, note: "Simulation : aucun envoi" });
      continue;
    }

    const report = await executeStepInstance(instance.id, options.actorId ?? null);
    const status = report.sent > 0 && report.failed === 0 ? "success" : report.sent > 0 ? "partial" : report.failed > 0 ? "failed" : "skipped";

    await prisma.stepExecution.create({
      data: {
        stepInstanceId: instance.id,
        sessionId: (await prisma.stepInstance.findUniqueOrThrow({ where: { id: instance.id }, select: { sessionId: true } })).sessionId,
        trigger: options.trigger,
        status,
        sentCount: report.sent,
        failedCount: report.failed,
        sandbox: report.sandbox,
        triggeredById: options.actorId ?? null,
        details: { redirectedTo: report.redirectedTo ?? null, skipped: report.skipped, recipients: report.details },
      },
    });

    summary.executed++;
    summary.sent += report.sent;
    summary.failed += report.failed;
    if (status === "skipped") summary.skipped++;
    summary.sandbox = report.sandbox;
    summary.items.push({
      stepInstanceId: instance.id,
      step: instance.stepTemplate.name,
      session: instance.session.name,
      status,
      sent: report.sent,
      failed: report.failed,
      note: report.skipped.join(" ") || report.details.find((d) => !d.ok)?.error,
    });
  }

  return summary;
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { readSendMessageParams } from "./action-params";
import { buildValues, renderMessage } from "@/lib/messages/render";
import { sendMail } from "@/lib/mail/send";
import { isSandbox, getSandboxAddress } from "@/lib/mail/config";
import { appUrl } from "@/lib/app-url";

export type ExecutionReport = {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: string[];
  sandbox: boolean;
  redirectedTo?: string;
  details: { to: string; label: string; ok: boolean; error?: string }[];
};

function studentSpaceUrl(): string {
  return appUrl("/espace");
}

// Exécute l'action d'une StepInstance. Palier 3 : seule `send_message`.
// Marque l'étape faite si au moins un envoi a réussi.
export async function executeStepInstance(instanceId: string, actorId: string | null): Promise<ExecutionReport> {
  const empty: ExecutionReport = { ok: false, sent: 0, failed: 0, skipped: [], sandbox: isSandbox(), details: [] };

  const instance = await prisma.stepInstance.findUnique({
    where: { id: instanceId },
    include: {
      stepTemplate: true,
      session: {
        include: {
          company: { select: { name: true, contactEmail: true, contactName: true } },
          trainer: { select: { name: true, email: true } },
          owner: { select: { name: true, email: true } },
          formationVersion: { include: { formation: { select: { name: true } } } },
          enrollments: { where: { status: { in: ["active", "completed"] } }, include: { user: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
  });
  if (!instance) return { ...empty, skipped: ["Étape introuvable"] };
  const { session, stepTemplate: step } = instance;

  // ─── Protections ─────────────────────────────────────────────────────────
  // Données de démonstration : jamais d'envoi, quelles que soient les autres
  // conditions (spec : les données démo ne doivent jamais toucher le réel).
  if (session.isDemo) return { ...empty, skipped: ["Session de démonstration : aucun envoi."] };
  if (session.status === "cancelled") return { ...empty, skipped: ["Session annulée : aucun envoi."] };
  if (step.actionType !== "send_message") return { ...empty, skipped: ["Cette étape n'envoie pas de message."] };

  const params = readSendMessageParams(step.actionParams);
  if (!params) return { ...empty, skipped: ["Aucun mail configuré sur cette étape."] };

  const template = await prisma.messageTemplate.findUnique({ where: { id: params.templateId } });
  if (!template) return { ...empty, skipped: ["Le mail configuré n'existe plus."] };

  const trainer = session.trainer ?? session.owner;
  const base = {
    formationName: session.formationVersion.formation.name,
    sessionName: session.name,
    startDate: session.startDate,
    endDate: session.endDate,
    durationHours: session.durationHours,
    companyName: session.company?.name ?? null,
    trainerName: trainer?.name ?? null,
    trainerEmail: trainer?.email ?? null,
    studentSpaceUrl: studentSpaceUrl(),
  };

  // ─── Destinataires ───────────────────────────────────────────────────────
  type Target = { email: string; label: string; student?: { id: string; name: string; email: string } };
  let targets: Target[] = [];
  const skipped: string[] = [];

  if (params.recipient === "students") {
    targets = session.enrollments.map((e) => ({ email: e.user.email, label: e.user.name, student: e.user }));
    if (targets.length === 0) skipped.push("Aucun élève inscrit à cette session.");
  } else if (params.recipient === "company_contact") {
    if (session.company?.contactEmail) targets = [{ email: session.company.contactEmail, label: session.company.contactName ?? session.company.name }];
    else skipped.push("L'entreprise n'a pas d'email de contact.");
  } else {
    if (trainer?.email) targets = [{ email: trainer.email, label: trainer.name }];
    else skipped.push("La session n'a pas de formateur avec email.");
  }
  if (targets.length === 0) return { ...empty, skipped };

  // ─── Envoi ───────────────────────────────────────────────────────────────
  const details: ExecutionReport["details"] = [];
  let sent = 0, failed = 0;

  for (const target of targets) {
    const values = buildValues({ ...base, student: target.student ? { name: target.student.name, email: target.student.email } : null });
    const { subject, html, text } = renderMessage(template, values);
    const result = await sendMail({ intendedTo: target.email, subject, html, text });

    if (result.ok) {
      sent++;
      details.push({ to: target.email, label: target.label, ok: true });
      // Trace dans la conversation de l'élève (1 fil par élève × session).
      if (target.student) {
        const conversation = await prisma.conversation.upsert({
          where: { sessionId_userId: { sessionId: session.id, userId: target.student.id } },
          create: { sessionId: session.id, userId: target.student.id },
          update: {},
        });
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: null,
            autoGenerated: true,
            body: `**${subject}**\n\n${text}`,
            attachments: {
              kind: "email",
              stepInstanceId: instance.id,
              messageTemplateId: template.id,
              providerId: result.id,
              sentTo: result.sentTo,
              sandbox: result.redirected,
            },
          },
        });
      }
    } else {
      failed++;
      details.push({ to: target.email, label: target.label, ok: false, error: result.error });
    }
  }

  // L'étape est faite si au moins un envoi a abouti.
  if (sent > 0 && instance.status === "pending") {
    await prisma.stepInstance.update({ where: { id: instance.id }, data: { status: "done", doneAt: new Date(), doneById: actorId } });
  }

  return {
    ok: failed === 0 && sent > 0,
    sent,
    failed,
    skipped,
    sandbox: isSandbox(),
    redirectedTo: isSandbox() ? getSandboxAddress() : undefined,
    details,
  };
}

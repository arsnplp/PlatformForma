import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { phaseLabel } from "@/lib/labels";

type Tx = Prisma.TransactionClient;
type StepLike = { triggerType: string; triggerAnchor: string | null; triggerOffsetDays: number | null };

// ── Échéances ───────────────────────────────────────────────────────────────
// Seules les étapes `time_offset` ancrées sur start_date / end_date ont une
// date calculable. manual et event n'ont pas d'échéance ; un time_offset ancré
// sur un événement (signature, accord OPCO…) n'en aura qu'une fois l'événement
// survenu (palier 3).
export function computeDueDate(step: StepLike, session: { startDate: Date; endDate: Date }): Date | null {
  if (step.triggerType !== "time_offset") return null;
  const base = step.triggerAnchor === "start_date" ? session.startDate : step.triggerAnchor === "end_date" ? session.endDate : null;
  if (!base) return null;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + (step.triggerOffsetDays ?? 0));
  return d;
}

const stepInclude = {
  assigneeUser: { select: { id: true, name: true } },
  assigneeRole: { select: { id: true, key: true, label: true } },
} as const;

async function loadSessionWithTemplate(db: Tx | typeof prisma, sessionId: string) {
  return db.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      formationVersion: {
        include: {
          processTemplates: {
            where: { archivedAt: null },
            take: 1,
            include: { steps: { orderBy: { order: "asc" }, include: stepInclude } },
          },
        },
      },
    },
  });
}

// ── Instanciation (à la création de la session) ─────────────────────────────
// Crée une StepInstance par étape du process de la version, avec échéance.
// Idempotent : ne fait rien si la session a déjà sa checklist.
export async function instantiateProcess(db: Tx, sessionId: string) {
  const session = await loadSessionWithTemplate(db, sessionId);
  const existing = await db.stepInstance.count({ where: { sessionId } });
  if (existing > 0) return 0;
  const steps = session.formationVersion.processTemplates[0]?.steps ?? [];
  if (steps.length === 0) return 0;
  await db.stepInstance.createMany({
    data: steps.map((s) => ({ sessionId, stepTemplateId: s.id, status: "pending", dueDate: computeDueDate(s, session) })),
  });
  return steps.length;
}

// ── Recalcul (tant que la session est `planned` et non figée) ────────────────
export async function recomputeDueDates(db: Tx, sessionId: string) {
  const session = await loadSessionWithTemplate(db, sessionId);
  if (session.status !== "planned" || session.processSnapshot) return 0;
  const instances = await db.stepInstance.findMany({ where: { sessionId }, include: { stepTemplate: true } });
  let n = 0;
  for (const inst of instances) {
    const due = computeDueDate(inst.stepTemplate, session);
    const changed = (due?.getTime() ?? null) !== (inst.dueDate?.getTime() ?? null);
    if (changed) {
      await db.stepInstance.update({ where: { id: inst.id }, data: { dueDate: due } });
      n++;
    }
  }
  return n;
}

// ── Gel (premier passage en `running`) — piège n°5 ───────────────────────────
// Copie intégrale du process et des échéances dans Session.processSnapshot.
// Modifier le modèle ensuite n'affecte plus jamais cette session.
export async function freezeProcess(db: Tx, sessionId: string) {
  const session = await loadSessionWithTemplate(db, sessionId);
  if (session.processSnapshot) return false;
  const template = session.formationVersion.processTemplates[0];
  const instances = await db.stepInstance.findMany({
    where: { sessionId },
    include: { stepTemplate: { include: stepInclude } },
    orderBy: { stepTemplate: { order: "asc" } },
  });
  const snapshot = {
    frozenAt: new Date().toISOString(),
    formationVersionId: session.formationVersionId,
    processTemplate: template ? { id: template.id, name: template.name } : null,
    session: { startDate: session.startDate.toISOString().slice(0, 10), endDate: session.endDate.toISOString().slice(0, 10) },
    steps: instances.map(({ stepTemplate: t, ...i }) => ({
      stepInstanceId: i.id,
      stepTemplateId: t.id,
      order: t.order,
      phase: t.phase,
      phaseLabel: phaseLabel(t.phase),
      name: t.name,
      description: t.description,
      assignee: t.assigneeUser ? { type: "user", id: t.assigneeUser.id, name: t.assigneeUser.name } : t.assigneeRole ? { type: "role", id: t.assigneeRole.id, key: t.assigneeRole.key, label: t.assigneeRole.label } : null,
      triggerType: t.triggerType,
      triggerAnchor: t.triggerAnchor,
      triggerOffsetDays: t.triggerOffsetDays,
      actionType: t.actionType,
      actionParams: t.actionParams,
      dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : null,
      statusAtFreeze: i.status,
    })),
  };
  await db.session.update({ where: { id: sessionId }, data: { processSnapshot: snapshot as Prisma.InputJsonValue } });
  return true;
}

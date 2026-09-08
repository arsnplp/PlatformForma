import { prisma } from "@/lib/prisma";
import { PHASES, TRIGGER_ANCHOR, STEP_STATUS } from "@/lib/labels";
import { readSendMessageParams, RECIPIENTS, isAttendanceStep } from "@/lib/process/action-params";
import { getAttendanceState } from "@/lib/queries/attendance";
import { formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";
import { setStepStatus } from "@/lib/actions/steps";
import { ExecuteStepButton } from "./execute-step-button";
import { getMailMode, getSandboxAddress } from "@/lib/mail/config";
import { Button } from "@/components/ui/button";

// Checklist réelle d'une session (StepInstance), groupée par phase.
// Cocher / passer / rouvrir tracent doneBy et doneAt ; rien n'est jamais supprimé.
export async function ChecklistSection({ sessionId, frozenAt, sessionStatus, isDemoSession = false, readOnly = false }: { sessionId: string; frozenAt: string | null; sessionStatus: string; isDemoSession?: boolean; readOnly?: boolean }) {
  const instances = await prisma.stepInstance.findMany({
    where: { sessionId },
    include: {
      stepTemplate: { include: { assigneeUser: { select: { name: true } }, assigneeRole: { select: { label: true } } } },
      doneBy: { select: { name: true } },
    },
    orderBy: { stepTemplate: { order: "asc" } },
  });

  if (instances.length === 0) {
    return <EmptyState title="Aucune étape">Le process de la version ne contenait aucune étape à la création de la session.</EmptyState>;
  }

  const mailIds = instances.map((i) => readSendMessageParams(i.stepTemplate.actionParams)?.templateId).filter((x): x is string => Boolean(x));
  const mails = mailIds.length ? await prisma.messageTemplate.findMany({ where: { id: { in: mailIds } }, select: { id: true, name: true } }) : [];
  const mailName = new Map(mails.map((m) => [m.id, m.name]));

  const mailMode = getMailMode();
  const sandboxTo = mailMode === "production" ? null : getSandboxAddress();
  const hasSend = instances.some((i) => i.stepTemplate.actionType === "send_message");

  // Étape adossée aux émargements : son avancement vient des signatures réelles,
  // elle ne se coche plus à la main (spec §6.2, action request_signature).
  const hasAttendance = instances.some((i) => isAttendanceStep(i.stepTemplate.actionType, i.stepTemplate.actionParams));
  const attendance = hasAttendance ? await getAttendanceState(sessionId) : null;

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const byPhase = PHASES.map((p) => ({ ...p, items: instances.filter((i) => i.stepTemplate.phase === p.n) })).filter((p) => p.items.length > 0);
  const withDue = instances.filter((i) => i.dueDate).length;
  const done = instances.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-5">
      {hasSend && !readOnly ? (
        sandboxTo ? (
          <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
            <strong>Bac à sable</strong> — tout mail déclenché ici part vers {sandboxTo} uniquement, jamais vers un élève.
            {isDemoSession ? " Cette session est marquée démo : aucun envoi." : ""}
          </p>
        ) : (
          <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">
            <strong>Mode production</strong> — les mails partent réellement aux destinataires.
          </p>
        )
      ) : null}
      <p className="text-sm text-foreground-secondary">
        {done} / {instances.length} étape(s) faites · {withDue} avec échéance calculée ·{" "}
        {frozenAt
          ? `process figé le ${formatDateTime(frozenAt)}`
          : sessionStatus === "planned"
            ? "échéances recalculées si les dates changent (session planifiée)"
            : "process non figé"}
      </p>
      {byPhase.map((phase) => (
        <section key={phase.n} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            <span className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">P{phase.n}</span>
            {phase.label}
          </h3>
          <ol className="divide-y rounded-md border">
            {phase.items.map((i) => {
              const t = i.stepTemplate;
              const assignee = t.assigneeUser?.name ?? t.assigneeRole?.label ?? "Non assigné";
              const late = i.status === "pending" && i.dueDate && i.dueDate < today;
              const dueLabel = i.dueDate
                ? formatDate(i.dueDate)
                : t.triggerType === "manual"
                  ? "Manuel"
                  : t.triggerType === "event"
                    ? `Sur événement · ${t.triggerAnchor ? TRIGGER_ANCHOR[t.triggerAnchor] : "—"}`
                    : `Après ${t.triggerAnchor ? TRIGGER_ANCHOR[t.triggerAnchor].toLowerCase() : "—"} ${t.triggerOffsetDays && t.triggerOffsetDays !== 0 ? (t.triggerOffsetDays > 0 ? `+${t.triggerOffsetDays} j` : `${t.triggerOffsetDays} j`) : ""}`;
              const st = STEP_STATUS[i.status];
              // Étape d'émargement : c'est la signature des demi-journées qui
              // fait foi, pas une case cochée à la main.
              const isAttendance = isAttendanceStep(t.actionType, t.actionParams);
              const attendanceDone = isAttendance && attendance ? attendance.complete === attendance.total && attendance.total > 0 : false;
              return (
                <li key={i.id} className={cn("flex items-start gap-3 px-3 py-2.5 text-sm", i.status !== "pending" && "opacity-70")}>
                  <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-foreground-tertiary">{t.order}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", i.status === "done" && "line-through")}>{t.name}</p>
                    <p className="text-xs text-foreground-secondary">
                      {assignee}
                      {(() => {
                        const p = readSendMessageParams(t.actionParams);
                        if (t.actionType !== "send_message" || !p) return null;
                        return <span className="text-brand"> · enverra « {mailName.get(p.templateId) ?? "mail supprimé"} » à {RECIPIENTS[p.recipient].toLowerCase()}</span>;
                      })()}
                      {isAttendance && attendance ? (
                        <span className="text-brand">
                          {" "}· {attendance.complete} / {attendance.total} demi-journée(s) signée(s)
                        </span>
                      ) : null}
                      {i.doneAt ? ` · ${i.status === "skipped" ? "passée" : "fait"} le ${formatDateTime(i.doneAt)}${i.doneBy ? ` par ${i.doneBy.name}` : ""}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("text-xs tabular-nums", i.dueDate ? (late ? "font-medium text-status-red" : "text-foreground") : "text-foreground-tertiary")}>
                      {late ? "En retard · " : ""}{dueLabel}
                    </span>
                    {isAttendance && attendance ? (
                      <StatusBadge tone={attendanceDone ? "green" : "yellow"}>
                        {attendanceDone ? "Émargements complets" : "Émargements en cours"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone={late ? "red" : st.tone}>{st.label}</StatusBadge>
                    )}
                    {!readOnly && t.actionType === "send_message" && readSendMessageParams(t.actionParams) ? (
                      <ExecuteStepButton instanceId={i.id} disabled={isDemoSession} />
                    ) : null}
                    {!readOnly && !isAttendance ? (
                      <span className="inline-flex items-center gap-0.5">
                        {i.status !== "done" ? (
                          <form action={setStepStatus.bind(null, i.id, "done")}>
                            <Button type="submit" variant={i.status === "pending" ? "outline" : "ghost"} size="sm" className="h-7">Fait</Button>
                          </form>
                        ) : null}
                        {i.status === "pending" ? (
                          <form action={setStepStatus.bind(null, i.id, "skipped")}>
                            <Button type="submit" variant="ghost" size="sm" className="h-7 text-foreground-tertiary">Passer</Button>
                          </form>
                        ) : null}
                        {i.status !== "pending" ? (
                          <form action={setStepStatus.bind(null, i.id, "pending")}>
                            <Button type="submit" variant="ghost" size="sm" className="h-7 text-foreground-tertiary">Rouvrir</Button>
                          </form>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

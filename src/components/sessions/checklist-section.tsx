import { prisma } from "@/lib/prisma";
import { PHASES, TRIGGER_ANCHOR, STEP_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";

// Checklist réelle d'une session (StepInstance), groupée par phase.
// Palier 2 (b) : lecture + échéances. Les actions (cocher / passer) arrivent en (c).
export async function ChecklistSection({ sessionId, frozenAt }: { sessionId: string; frozenAt: string | null }) {
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

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const byPhase = PHASES.map((p) => ({ ...p, items: instances.filter((i) => i.stepTemplate.phase === p.n) })).filter((p) => p.items.length > 0);
  const withDue = instances.filter((i) => i.dueDate).length;
  const done = instances.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground-secondary">
        {done} / {instances.length} étape(s) faites · {withDue} avec échéance calculée ·{" "}
        {frozenAt ? `process figé le ${formatDateTime(frozenAt)}` : "échéances recalculées si les dates changent (session planifiée)"}
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
              return (
                <li key={i.id} className={cn("flex items-start gap-3 px-3 py-2.5 text-sm", i.status === "done" && "opacity-70")}>
                  <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-foreground-tertiary">{t.order}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", i.status === "done" && "line-through")}>{t.name}</p>
                    <p className="text-xs text-foreground-secondary">
                      {assignee}
                      {i.doneAt ? ` · fait le ${formatDateTime(i.doneAt)}${i.doneBy ? ` par ${i.doneBy.name}` : ""}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("text-xs tabular-nums", i.dueDate ? (late ? "font-medium text-status-red" : "text-foreground") : "text-foreground-tertiary")}>
                      {late ? "En retard · " : ""}{dueLabel}
                    </span>
                    <StatusBadge tone={late ? "red" : st.tone}>{st.label}</StatusBadge>
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

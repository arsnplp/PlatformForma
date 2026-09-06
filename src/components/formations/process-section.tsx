import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { applyDefaultProcess, copyProcessFrom, removeStep, moveStep } from "@/lib/actions/process";
import { listProcessSources } from "@/lib/queries/process";
import { CopyProcessForm } from "./copy-process-form";
import type { CurrentUser } from "@/lib/auth/session";
import { PHASES, TRIGGER_ANCHOR, ACTION_TYPE } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/admin/confirm-button";

// Onglet « Process » d'une version : étapes groupées par phase (spec §6).
// Éditable sur un brouillon uniquement ; gelé une fois publié.
export async function ProcessSection({
  me,
  formationId,
  versionId,
  versionNumber,
  editable,
}: {
  me: CurrentUser;
  formationId: string;
  versionId: string;
  versionNumber: number;
  editable: boolean;
}) {
  const template = await prisma.processTemplate.findFirst({
    where: { formationVersionId: versionId, archivedAt: null },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { assigneeUser: { select: { name: true } }, assigneeRole: { select: { label: true } } },
      },
    },
  });
  const steps = template?.steps ?? [];
  const sources = editable ? await listProcessSources(me, versionId) : [];

  if (steps.length === 0) {
    return (
      <div className="space-y-4 px-5 py-6 text-sm">
        <p className="text-foreground-secondary">Aucune étape dans le process de cette version.</p>
        {editable ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <form action={applyDefaultProcess.bind(null, versionId)}>
                <Button type="submit" variant="outline">Appliquer le process standard (28 étapes)</Button>
              </form>
              <Button asChild variant="outline">
                <Link href={`/admin/formations/${formationId}/process/nouvelle?v=${versionNumber}`}>Ajouter une étape</Link>
              </Button>
            </div>
            <CopyProcessForm action={copyProcessFrom.bind(null, versionId)} sources={sources} hasSteps={false} />
          </div>
        ) : null}
      </div>
    );
  }

  const byPhase = PHASES.map((p) => ({ ...p, steps: steps.filter((s) => s.phase === p.n) })).filter((p) => p.steps.length > 0);

  return (
    <div className="space-y-6 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-foreground-secondary">
          {template?.name} · {steps.length} étape(s)
          {!editable ? " · gelé (version publiée)" : ""}
        </p>
        {editable ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/formations/${formationId}/process/nouvelle?v=${versionNumber}`}>Ajouter une étape</Link>
          </Button>
        ) : null}
      </div>

      {byPhase.map((phase) => (
        <section key={phase.n} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            <span className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">P{phase.n}</span>
            {phase.label}
            <span className="font-normal text-foreground-tertiary">· {phase.hint}</span>
          </h3>
          <ol className="divide-y rounded-md border">
            {phase.steps.map((s, i) => {
              const trigger =
                s.triggerType === "manual"
                  ? "Manuel"
                  : s.triggerType === "event"
                    ? `Événement · ${s.triggerAnchor ? TRIGGER_ANCHOR[s.triggerAnchor] : "—"}`
                    : `${s.triggerAnchor ? TRIGGER_ANCHOR[s.triggerAnchor] : "—"} ${s.triggerOffsetDays === 0 ? "J" : (s.triggerOffsetDays ?? 0) > 0 ? `J+${s.triggerOffsetDays}` : `J${s.triggerOffsetDays}`}`;
              const assignee = s.assigneeUser?.name ?? s.assigneeRole?.label ?? "Non assigné";
              return (
                <li key={s.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                  <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-foreground-tertiary">{s.order}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-foreground-secondary">
                      {assignee} · {trigger} · {ACTION_TYPE[s.actionType].label}
                    </p>
                    {s.description ? <p className="mt-0.5 text-xs text-foreground-tertiary">{s.description}</p> : null}
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <form action={moveStep.bind(null, s.id, "up")}>
                        <Button type="submit" variant="ghost" size="sm" className="h-7 px-2" disabled={i === 0} aria-label="Monter">↑</Button>
                      </form>
                      <form action={moveStep.bind(null, s.id, "down")}>
                        <Button type="submit" variant="ghost" size="sm" className="h-7 px-2" disabled={i === phase.steps.length - 1} aria-label="Descendre">↓</Button>
                      </form>
                      <Button asChild variant="ghost" size="sm" className="h-7">
                        <Link href={`/admin/formations/${formationId}/process/${s.id}?v=${versionNumber}`}>Modifier</Link>
                      </Button>
                      <ConfirmButton action={removeStep.bind(null, s.id)} title={`Retirer « ${s.name} » ?`} description="Uniquement sur ce brouillon : les versions publiées et leurs sessions ne changent pas." confirmLabel="Retirer" variant="ghost">
                        Retirer
                      </ConfirmButton>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {editable ? <CopyProcessForm action={copyProcessFrom.bind(null, versionId)} sources={sources} hasSteps={steps.length > 0} /> : null}
    </div>
  );
}

import Link from "next/link";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { listMyPendingSteps } from "@/lib/queries/steps";
import { setStepStatus } from "@/lib/actions/steps";
import { phaseLabel, TRIGGER_ANCHOR } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";

type Item = Awaited<ReturnType<typeof listMyPendingSteps>>["late"][number];

const daysDiff = (d: Date, today: Date) => Math.round((d.getTime() - today.getTime()) / 86_400_000);

function StepRow({ i, today, showOwner }: { i: Item; today: Date; showOwner: boolean }) {
  const t = i.stepTemplate;
  const assignee = t.assigneeUser?.name ?? t.assigneeRole?.label ?? "Non assigné";
  const isLate = i.dueDate ? i.dueDate < today : false;
  const dueText = i.dueDate
    ? isLate
      ? `${formatDate(i.dueDate)} · ${-daysDiff(i.dueDate, today)} j de retard`
      : daysDiff(i.dueDate, today) === 0
        ? "Aujourd'hui"
        : `${formatDate(i.dueDate)} · dans ${daysDiff(i.dueDate, today)} j`
    : t.triggerType === "event"
      ? `Sur événement · ${t.triggerAnchor ? TRIGGER_ANCHOR[t.triggerAnchor] : "—"}`
      : "Manuel";
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t.name}</p>
        <p className="text-xs text-foreground-secondary">
          <Link href={`/admin/sessions/${i.session.id}`} className="hover:underline">{i.session.name}</Link>
          {showOwner ? ` · ${i.session.owner.name}` : ""} · P{t.phase} {phaseLabel(t.phase)} · {assignee}
        </p>
      </div>
      <span className={cn("shrink-0 text-xs tabular-nums", isLate ? "font-medium text-status-red" : i.dueDate ? "text-foreground" : "text-foreground-tertiary")}>{dueText}</span>
      <form action={setStepStatus.bind(null, i.id, "done")} className="shrink-0">
        <Button type="submit" variant="outline" size="sm" className="h-7">Fait</Button>
      </form>
    </li>
  );
}

function StepGroup({ title, items, tone, today, showOwner }: { title: string; items: Item[]; tone: "red" | "blue" | "gray"; today: Date; showOwner: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        <StatusBadge tone={tone}>{items.length}</StatusBadge>
      </h2>
      <ol className="divide-y rounded-md border">
        {items.map((i) => <StepRow key={i.id} i={i} today={today} showOwner={showOwner} />)}
      </ol>
    </section>
  );
}

// Accueil du back-office : « Mes étapes à faire », toutes sessions confondues,
// triées par échéance, retards en tête (spec §6.3).
export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const me = await requireUser("/admin");
  const { all } = await searchParams;
  const showAll = all === "1";
  const canAct = hasPermission(me, "can_manage_sessions");
  const { late, upcoming, undated, total, today } = canAct
    ? await listMyPendingSteps(me, { all: showAll })
    : { late: [], upcoming: [], undated: [], total: 0, today: new Date() };
  const showOwner = canSupervise(me);
  const toggle = "rounded-md px-2.5 py-1 text-sm transition-colors";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Bonjour ${me.name.split(" ")[0]}`}
        description={
          canAct
            ? `${total} étape(s) à faire sur tes sessions planifiées et en cours${late.length ? `, dont ${late.length} en retard` : ""}.`
            : me.email
        }
      />

      {canAct ? (
        <>
          <div className="inline-flex items-center gap-1 rounded-md bg-surface p-0.5">
            <Link href="/admin" className={cn(toggle, !showAll ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}>Mes étapes</Link>
            <Link href="/admin?all=1" className={cn(toggle, showAll ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}>Toutes les étapes</Link>
          </div>

          {total === 0 ? (
            <EmptyState title="Rien à faire pour l'instant">
              Les étapes apparaissent ici dès qu&apos;une session est créée. <Link href="/admin/sessions" className="underline">Voir les sessions</Link>
            </EmptyState>
          ) : (
            <div className="space-y-8">
              <StepGroup title="En retard" items={late} tone="red" today={today} showOwner={showOwner} />
              <StepGroup title="À venir" items={upcoming} tone="blue" today={today} showOwner={showOwner} />
              <StepGroup title="Sans échéance (manuel ou sur événement)" items={undated} tone="gray" today={today} showOwner={showOwner} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

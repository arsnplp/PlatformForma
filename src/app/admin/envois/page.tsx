import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { canSupervise, ownerFilter } from "@/lib/auth/ownership";
import { getMailMode, getSandboxAddress } from "@/lib/mail/config";
import { formatDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { RunCronPanel } from "@/components/admin/run-cron-panel";
import { RetryExecutionButton } from "@/components/admin/retry-execution-button";

const STATUS = {
  success: { label: "Succès", tone: "green" },
  partial: { label: "Partiel", tone: "yellow" },
  failed: { label: "Échec", tone: "red" },
  skipped: { label: "Ignorée", tone: "gray" },
} as const;

type Details = { redirectedTo?: string | null; skipped?: string[]; recipients?: { to: string; label: string; ok: boolean; error?: string }[] };

// Journal d'exécution des envois automatiques (spec §6.3).
export default async function EnvoisPage() {
  const me = await requireUser("/admin/envois");
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");
  const supervisor = canSupervise(me);
  const mode = getMailMode();
  const sandboxTo = mode === "production" ? null : getSandboxAddress();

  const executions = await prisma.stepExecution.findMany({
    where: { session: ownerFilter(me) },
    include: {
      stepInstance: { include: { stepTemplate: { select: { name: true } } } },
      session: { select: { id: true, name: true, owner: { select: { name: true } } } },
      triggeredBy: { select: { name: true } },
    },
    orderBy: { at: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Envois automatiques"
        description="Ce que la plateforme a envoyé à ta place : quand, pour quelle étape, vers qui, et avec quel résultat."
      />

      {supervisor ? <RunCronPanel sandbox={mode !== "production"} sandboxTo={sandboxTo} /> : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Journal</h2>
        {executions.length === 0 ? (
          <EmptyState title="Aucun envoi enregistré">Le journal se remplit dès que le cron ou un envoi manuel s&apos;exécute.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quand</TableHead>
                <TableHead>Étape</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Destinataires</TableHead>
                <TableHead className="text-right">Résultat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((e) => {
                const st = STATUS[e.status];
                const d = (e.details ?? {}) as Details;
                const failures = (d.recipients ?? []).filter((r) => !r.ok);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-foreground-secondary">
                      {formatDateTime(e.at)}
                      <span className="block text-xs text-foreground-tertiary">
                        {e.trigger === "cron" ? "cron" : `manuel${e.triggeredBy ? ` · ${e.triggeredBy.name}` : ""}`}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{e.stepInstance.stepTemplate.name}</TableCell>
                    <TableCell className="text-foreground-secondary">
                      <Link href={`/admin/sessions/${e.session.id}`} className="hover:underline">{e.session.name}</Link>
                      {supervisor ? <span className="block text-xs text-foreground-tertiary">{e.session.owner.name}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-foreground-secondary">
                      {(d.recipients ?? []).length === 0 ? "—" : (d.recipients ?? []).map((r) => r.label).join(", ")}
                      {d.redirectedTo ? <span className="block text-foreground-tertiary">redirigé vers {d.redirectedTo}</span> : null}
                      {d.skipped?.length ? <span className="block text-status-orange">{d.skipped.join(" ")}</span> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        {e.sandbox ? <StatusBadge tone="yellow">Bac à sable</StatusBadge> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-foreground-tertiary">
                        {e.sentCount} envoi(s){e.failedCount > 0 ? ` · ${e.failedCount} échec(s)` : ""}
                      </span>
                      {failures.length > 0 ? <span className="ml-auto block max-w-xs text-xs text-status-red">{failures[0].error}</span> : null}
                      {e.status === "failed" || e.status === "partial" ? (
                        <span className="mt-1 flex justify-end"><RetryExecutionButton instanceId={e.stepInstanceId} /></span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

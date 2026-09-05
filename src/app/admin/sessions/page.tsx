import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { ownerFilter, canSupervise } from "@/lib/auth/ownership";
import { SESSION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";

export default async function SessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  const me = await requireUser("/admin/sessions");
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");
  const cancelled = (await searchParams).cancelled === "1";
  const supervisor = canSupervise(me);

  const sessions = await prisma.session.findMany({
    where: { ...(cancelled ? { status: "cancelled" } : { status: { not: "cancelled" } }), ...ownerFilter(me) },
    include: {
      owner: { select: { name: true } },
      trainer: { select: { name: true } },
      company: { select: { name: true } },
      formationVersion: { select: { versionNumber: true, formation: { select: { id: true, name: true } } } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { startDate: "desc" },
  });

  const item = "rounded-md px-2.5 py-1 text-sm transition-colors";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sessions"
        description="Le vécu : chaque session pointe vers une version précise et gelée d'une formation."
        actions={
          <Button asChild>
            <Link href="/admin/sessions/nouvelle">Nouvelle session</Link>
          </Button>
        }
      />
      <div className="inline-flex items-center gap-1 rounded-md bg-surface p-0.5">
        <Link href="/admin/sessions" className={cn(item, !cancelled ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}>
          En cours et à venir
        </Link>
        <Link href="/admin/sessions?cancelled=1" className={cn(item, cancelled ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}>
          Annulées
        </Link>
      </div>

      {sessions.length === 0 ? (
        <EmptyState title={cancelled ? "Aucune session annulée" : "Aucune session"} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Formation</TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead>Formateur</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Inscrits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/sessions/${s.id}`} className="hover:underline">{s.name}</Link>
                  {supervisor ? <span className="block text-xs font-normal text-foreground-tertiary">{s.owner.name}</span> : null}
                </TableCell>
                <TableCell className="text-foreground-secondary">
                  <Link href={`/admin/formations/${s.formationVersion.formation.id}?v=${s.formationVersion.versionNumber}`} className="hover:underline">
                    {s.formationVersion.formation.name} · v{s.formationVersion.versionNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-foreground-secondary">{s.company?.name ?? "—"}</TableCell>
                <TableCell className="text-foreground-secondary">{s.trainer?.name ?? "—"}</TableCell>
                <TableCell><StatusBadge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</StatusBadge></TableCell>
                <TableCell className="text-foreground-secondary whitespace-nowrap">{formatDate(s.startDate)} → {formatDate(s.endDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{s._count.enrollments}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

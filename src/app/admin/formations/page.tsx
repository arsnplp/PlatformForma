import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { ownerFilter, canSupervise } from "@/lib/auth/ownership";
import { FORMATION_VERSION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ArchivedToggle } from "@/components/admin/archived-toggle";

export default async function FormationsPage({ searchParams }: PageProps<"/admin/formations">) {
  const me = await requireUser("/admin/formations");
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");
  const archived = (await searchParams).archived === "1";
  const supervisor = canSupervise(me);

  const formations = await prisma.formation.findMany({
    where: { ...(archived ? { archivedAt: { not: null } } : { archivedAt: null }), ...ownerFilter(me) },
    include: {
      owner: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, select: { versionNumber: true, status: true, _count: { select: { sessions: true } } } },
    },
    orderBy: archived ? { archivedAt: "desc" } : { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Formations"
        description="Le modèle : identité stable, contenu versionné. Chaque session pointe vers une version précise, gelée."
        actions={
          <Button asChild>
            <Link href="/admin/formations/nouvelle">Nouvelle formation</Link>
          </Button>
        }
      />
      <ArchivedToggle basePath="/admin/formations" archived={archived} />

      {formations.length === 0 ? (
        <EmptyState title={archived ? "Aucune formation archivée" : "Aucune formation"}>
          {!archived ? "Crée ta première formation : elle démarre en brouillon v1." : null}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Secteur</TableHead>
              {supervisor ? <TableHead>Propriétaire</TableHead> : null}
              <TableHead>Version active</TableHead>
              <TableHead className="text-right">Versions</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">{archived ? "Archivée le" : "Créée le"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formations.map((f) => {
              const active = f.versions.find((v) => v.status === "active");
              const latest = f.versions[0];
              const sessions = f.versions.reduce((n, v) => n + v._count.sessions, 0);
              return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/formations/${f.id}`} className="hover:underline">
                      {f.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-foreground-secondary">{f.sector ?? "—"}</TableCell>
                  {supervisor ? <TableCell className="text-foreground-secondary">{f.owner.name}</TableCell> : null}
                  <TableCell>
                    {active ? (
                      <StatusBadge tone="green">v{active.versionNumber} active</StatusBadge>
                    ) : latest ? (
                      <StatusBadge tone={FORMATION_VERSION_STATUS[latest.status].tone}>
                        v{latest.versionNumber} {FORMATION_VERSION_STATUS[latest.status].label.toLowerCase()}
                      </StatusBadge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.versions.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{sessions}</TableCell>
                  <TableCell className="text-right text-foreground-secondary">{formatDate(archived ? f.archivedAt : f.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { ownerFilter, canSupervise } from "@/lib/auth/ownership";
import { PROSPECT_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ArchivedToggle } from "@/components/admin/archived-toggle";

export default async function ProspectsPage({ searchParams }: PageProps<"/admin/prospects">) {
  const me = await requireUser("/admin/prospects");
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");
  const archived = (await searchParams).archived === "1";
  const supervisor = canSupervise(me);

  const prospects = await prisma.prospect.findMany({
    where: { ...(archived ? { archivedAt: { not: null } } : { archivedAt: null }), ...ownerFilter(me) },
    include: { company: { select: { id: true, name: true, archivedAt: true } }, owner: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Prospects"
        description="Phase 0 du process : premier contact jusqu'à la signature."
        actions={
          <Button asChild>
            <Link href="/admin/prospects/nouveau">Nouveau prospect</Link>
          </Button>
        }
      />

      <ArchivedToggle basePath="/admin/prospects" archived={archived} />

      {prospects.length === 0 ? (
        <EmptyState title={archived ? "Aucun prospect archivé" : "Aucun prospect"} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entreprise</TableHead>
              <TableHead>Statut</TableHead>
              {supervisor ? <TableHead>Propriétaire</TableHead> : null}
              <TableHead>Premier appel</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prospects.map((p) => {
              const s = PROSPECT_STATUS[p.status];
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/entreprises/${p.company.id}`} className="hover:underline">
                      {p.company.name}
                    </Link>
                    {p.company.archivedAt ? (
                      <span className="ml-2 text-xs text-foreground-tertiary">(entreprise archivée)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                  </TableCell>
                  {supervisor ? <TableCell className="text-foreground-secondary">{p.owner.name}</TableCell> : null}
                  <TableCell className="text-foreground-secondary">{formatDateTime(p.firstCallAt)}</TableCell>
                  <TableCell className="max-w-xs truncate text-foreground-secondary">{p.notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {!archived ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/prospects/${p.id}/modifier`}>Modifier</Link>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

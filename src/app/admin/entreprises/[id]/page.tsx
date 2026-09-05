import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor, canSupervise } from "@/lib/auth/ownership";
import { archiveCompany, restoreCompany } from "@/lib/actions/companies";
import { archiveProspect, restoreProspect } from "@/lib/actions/prospects";
import { PROSPECT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ConfirmButton } from "@/components/admin/confirm-button";

export default async function CompanyPage({ params }: PageProps<"/admin/entreprises/[id]">) {
  const { id } = await params;
  const me = await requireUser(`/admin/entreprises/${id}`);
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      prospects: { orderBy: { createdAt: "desc" } },
      _count: { select: { sessions: true } },
    },
  });
  // Une entreprise d'un autre formateur n'existe pas pour moi (cloisonnement).
  if (!company || !isOwnerOrSupervisor(me, company.ownerId)) notFound();
  const isArchived = Boolean(company.archivedAt);

  const info: [string, string | null][] = [
    ["SIRET", company.siret],
    ["Secteur", company.sector],
    ["Contact", company.contactName],
    ["Email", company.contactEmail],
    ["Téléphone", company.contactPhone],
    ["Adresse", company.address],
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumb={[{ label: "Entreprises", href: "/admin/entreprises" }]}
        title={
          <span className="flex items-center gap-3">
            {company.name}
            {isArchived ? <StatusBadge tone="purple">Archivée</StatusBadge> : null}
          </span>
        }
        description={isArchived ? `Archivée le ${formatDate(company.archivedAt)}. Ses données restent intactes.` : undefined}
        actions={
          isArchived ? (
            <form action={restoreCompany.bind(null, company.id)}>
              <Button type="submit" variant="outline" size="sm">
                Restaurer
              </Button>
            </form>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/entreprises/${company.id}/modifier`}>Modifier</Link>
              </Button>
              <ConfirmButton
                action={archiveCompany.bind(null, company.id)}
                title="Archiver cette entreprise ?"
                description="Elle quitte les listes actives. Ses prospects, sessions et documents restent intacts et consultables."
                confirmLabel="Archiver"
              >
                Archiver
              </ConfirmButton>
            </>
          )
        }
      />

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {info.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-24 shrink-0 text-foreground-secondary">{k}</dt>
            <dd className="min-w-0 break-words">{v ?? <span className="text-foreground-tertiary">—</span>}</dd>
          </div>
        ))}
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-foreground-secondary">Sessions</dt>
          <dd className="tabular-nums">{company._count.sessions}</dd>
        </div>
        {canSupervise(me) ? (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-foreground-secondary">Propriétaire</dt>
            <dd>{company.owner.name}</dd>
          </div>
        ) : null}
      </dl>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Prospects</h2>
          {!isArchived ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/prospects/nouveau?companyId=${company.id}`}>Nouveau prospect</Link>
            </Button>
          ) : null}
        </div>

        {company.prospects.length === 0 ? (
          <EmptyState title="Aucun prospect pour cette entreprise" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statut</TableHead>
                <TableHead>Premier appel</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {company.prospects.map((p) => {
                const s = PROSPECT_STATUS[p.status];
                const pArchived = Boolean(p.archivedAt);
                return (
                  <TableRow key={p.id} className={pArchived ? "opacity-60" : undefined}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                        {pArchived ? <StatusBadge tone="purple">Archivé</StatusBadge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-foreground-secondary">{formatDateTime(p.firstCallAt)}</TableCell>
                    <TableCell className="max-w-xs truncate text-foreground-secondary">{p.notes ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {isArchived ? null : (
                      <span className="inline-flex items-center gap-1">
                        {pArchived ? (
                          <form action={restoreProspect.bind(null, p.id)}>
                            <Button type="submit" variant="ghost" size="sm">Restaurer</Button>
                          </form>
                        ) : (
                          <>
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/prospects/${p.id}/modifier`}>Modifier</Link>
                            </Button>
                            <ConfirmButton
                              action={archiveProspect.bind(null, p.id)}
                              title="Archiver ce prospect ?"
                              confirmLabel="Archiver"
                              variant="ghost"
                            >
                              Archiver
                            </ConfirmButton>
                          </>
                        )}
                      </span>
                      )}
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { ownerFilter, canSupervise } from "@/lib/auth/ownership";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ArchivedToggle } from "@/components/admin/archived-toggle";
import { ListFilters } from "@/components/admin/list-filters";

export default async function CompaniesPage({ searchParams }: PageProps<"/admin/entreprises">) {
  const me = await requireUser("/admin/entreprises");
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");
  const params = await searchParams;
  const archived = params.archived === "1";
  const supervisor = canSupervise(me);
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const sector = typeof params.secteur === "string" ? params.secteur : "";

  const sectors = await prisma.company.findMany({
    where: { ...ownerFilter(me), sector: { not: null } },
    distinct: ["sector"],
    orderBy: { sector: "asc" },
    select: { sector: true },
  });

  const companies = await prisma.company.findMany({
    where: {
      ...(archived ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...ownerFilter(me),
      ...(sector ? { sector } : {}),
      // Nom, SIRET ou contact : les trois façons de chercher une entreprise.
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { siret: { contains: search } },
              { contactName: { contains: search, mode: "insensitive" as const } },
              { contactEmail: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      owner: { select: { name: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: archived ? { archivedAt: "desc" } : { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Entreprises"
        description={
          supervisor
            ? "Toutes les entreprises, tous formateurs confondus. Une entreprise archivée reste consultable."
            : "Tes entreprises clientes. Une entreprise archivée reste consultable et garde son historique."
        }
        actions={
          <Button asChild>
            <Link href="/admin/entreprises/nouvelle">Nouvelle entreprise</Link>
          </Button>
        }
      />

      <ArchivedToggle basePath="/admin/entreprises" archived={archived} />

      <ListFilters
        searchPlaceholder="Nom, SIRET ou contact"
        filters={[
          {
            key: "secteur",
            label: "Secteur",
            allLabel: "Tous les secteurs",
            options: sectors
              .map((s) => s.sector)
              .filter((s): s is string => Boolean(s))
              .map((s) => ({ value: s, label: s })),
          },
        ]}
      />

      {companies.length === 0 ? (
        <EmptyState title={archived ? "Aucune entreprise archivée" : "Aucune entreprise"}>
          {!archived ? "Commence par créer une entreprise." : null}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Secteur</TableHead>
              <TableHead>Contact</TableHead>
              {supervisor ? <TableHead>Propriétaire</TableHead> : null}
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">{archived ? "Archivée le" : "Créée le"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/entreprises/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-foreground-secondary">{c.sector ?? "—"}</TableCell>
                <TableCell className="text-foreground-secondary">
                  {c.contactName ?? "—"}
                  {c.contactEmail ? <span className="block text-xs text-foreground-tertiary">{c.contactEmail}</span> : null}
                </TableCell>
                {supervisor ? <TableCell className="text-foreground-secondary">{c.owner.name}</TableCell> : null}
                <TableCell className="text-right tabular-nums">{c._count.sessions}</TableCell>
                <TableCell className="text-right text-foreground-secondary">
                  {formatDate(archived ? c.archivedAt : c.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

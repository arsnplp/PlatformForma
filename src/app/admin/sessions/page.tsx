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
import { ListFilters } from "@/components/admin/list-filters";

export default async function SessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  const me = await requireUser("/admin/sessions");
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");
  const params = await searchParams;
  const cancelled = params.cancelled === "1";
  const supervisor = canSupervise(me);
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.statut === "string" ? params.statut : "";
  const formationId = typeof params.formation === "string" ? params.formation : "";

  // Les formations proposées au filtre sont celles qui ont réellement des
  // sessions dans mon périmètre : une liste déroulante vide n'aide personne.
  const formations = await prisma.formation.findMany({
    where: { ...ownerFilter(me), versions: { some: { sessions: { some: {} } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const sessions = await prisma.session.findMany({
    where: {
      ...(cancelled ? { status: "cancelled" } : { status: { not: "cancelled" } }),
      ...ownerFilter(me),
      ...(status ? { status: status as never } : {}),
      ...(formationId ? { formationVersion: { formationId } } : {}),
      // La recherche porte sur ce qu'on a en tête : le nom de la session,
      // celui de la formation, ou l'entreprise cliente.
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { company: { name: { contains: search, mode: "insensitive" as const } } },
              { formationVersion: { formation: { name: { contains: search, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
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

      <ListFilters
        searchPlaceholder="Nom de session, formation ou entreprise"
        filters={[
          {
            key: "statut",
            label: "Statut",
            allLabel: "Tous les statuts",
            options: Object.entries(SESSION_STATUS)
              .filter(([key]) => key !== "cancelled")
              .map(([key, value]) => ({ value: key, label: value.label })),
          },
          {
            key: "formation",
            label: "Formation",
            allLabel: "Toutes les formations",
            options: formations.map((f) => ({ value: f.id, label: f.name })),
          },
        ]}
      />

      {sessions.length === 0 ? (
        <EmptyState title={search || status || formationId ? "Aucune session pour ces critères" : cancelled ? "Aucune session annulée" : "Aucune session"} />
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

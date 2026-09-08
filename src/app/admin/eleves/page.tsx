import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { listStudents } from "@/lib/queries/students";
import { SESSION_STATUS, ENROLLMENT_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ListFilters } from "@/components/admin/list-filters";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { prisma } from "@/lib/prisma";
import { ownerFilter } from "@/lib/auth/ownership";

// Axe Élève (spec §10.1) : chaque élève mène à son dossier complet.
export default async function StudentsPage({ searchParams }: PageProps<"/admin/eleves">) {
  const me = await requireUser("/admin/eleves");
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const sessionId = typeof params.session === "string" ? params.session : "";
  const status = typeof params.inscription === "string" ? params.inscription : "";

  const companyId = typeof params.entreprise === "string" ? params.entreprise : "";

  const [students, sessions, companies] = await Promise.all([
    listStudents(me, search, { sessionId, status, companyId }),
    prisma.session.findMany({
      where: { ...ownerFilter(me), enrollments: { some: {} } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
      take: 100,
    }),
    prisma.company.findMany({
      where: { ...ownerFilter(me), archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Élèves"
        description={
          canSupervise(me)
            ? "Tous les élèves de la plateforme. Chaque dossier est autonome et complet, anciens élèves inclus."
            : "Les élèves inscrits à tes sessions, anciens inclus."
        }
        actions={<CreateStudentForm companies={companies} />}
      />

      <ListFilters
        searchPlaceholder="Nom ou email d'un élève"
        filters={[
          {
            key: "session",
            label: "Session",
            allLabel: "Toutes les sessions",
            options: sessions.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            key: "entreprise",
            label: "Entreprise",
            allLabel: "Toutes les entreprises",
            options: companies.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            key: "inscription",
            label: "Inscription",
            allLabel: "Tous les statuts",
            options: Object.entries(ENROLLMENT_STATUS).map(([key, value]) => ({ value: key, label: value.label })),
          },
        ]}
      />

      {students.length === 0 ? (
        <EmptyState title={search || sessionId || status ? "Aucun élève pour ces critères" : "Aucun élève"}>
          {!search && !sessionId && !status ? "Inscris un élève depuis la fiche d'une session." : null}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Élève</TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead>Dernière session</TableHead>
              <TableHead className="text-right">En cours</TableHead>
              <TableHead className="text-right">Terminées</TableHead>
              <TableHead className="text-right">Abandons</TableHead>
              <TableHead className="text-right">Documents</TableHead>
              <TableHead className="text-right">Compte créé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => {
              const count = (st: "active" | "completed" | "dropped") => s.enrollments.filter((e) => e.status === st).length;
              const last = s.enrollments[0]?.session;
              const zero = <span className="text-foreground-tertiary">0</span>;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/admin/eleves/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                    <span className="block text-xs text-foreground-tertiary">{s.email}</span>
                  </TableCell>
                  <TableCell>
                    {s.company ? (
                      <Link href={`/admin/entreprises/${s.company.id}`} className="hover:underline">{s.company.name}</Link>
                    ) : (
                      <span className="text-xs text-foreground-tertiary">À titre personnel</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {last ? (
                      <>
                        <Link href={`/admin/sessions/${last.id}`} className="hover:underline">{last.name}</Link>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-foreground-tertiary">
                          <StatusBadge tone={SESSION_STATUS[last.status].tone}>{SESSION_STATUS[last.status].label}</StatusBadge>
                          {formatDate(last.startDate)} → {formatDate(last.endDate)}
                          {s.enrollments.length > 1 ? ` · +${s.enrollments.length - 1} autre(s)` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground-tertiary">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{count("active") ? <StatusBadge tone="blue">{count("active")}</StatusBadge> : zero}</TableCell>
                  <TableCell className="text-right">{count("completed") ? <StatusBadge tone="green">{count("completed")}</StatusBadge> : zero}</TableCell>
                  <TableCell className="text-right">{count("dropped") ? <StatusBadge tone="red">{count("dropped")}</StatusBadge> : zero}</TableCell>
                  <TableCell className="text-right tabular-nums">{s._count.documentsOwned}</TableCell>
                  <TableCell className="text-right text-foreground-secondary">{formatDate(s.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

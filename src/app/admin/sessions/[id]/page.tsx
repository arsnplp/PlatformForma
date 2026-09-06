import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor, canSupervise } from "@/lib/auth/ownership";
import { cancelSession, startSession } from "@/lib/actions/sessions";
import { enrollStudent, setEnrollmentStatus } from "@/lib/actions/enrollments";
import { listMyStudents } from "@/lib/queries/users";
import { SESSION_STATUS, ENROLLMENT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { EnrollForm } from "@/components/sessions/enroll-form";
import { ChecklistSection } from "@/components/sessions/checklist-section";

export default async function SessionPage({ params }: PageProps<"/admin/sessions/[id]">) {
  const { id } = await params;
  const me = await requireUser(`/admin/sessions/${id}`);
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      trainer: { select: { name: true } },
      company: { select: { id: true, name: true } },
      formationVersion: {
        include: {
          formation: { select: { id: true, name: true, archivedAt: true } },
          modules: { orderBy: { order: "asc" }, include: { _count: { select: { lessons: true } } } },
        },
      },
      enrollments: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { enrolledAt: "asc" } },
    },
  });
  if (!session || !isOwnerOrSupervisor(me, session.ownerId)) notFound();
  const students = await listMyStudents(me);
  const isCancelled = session.status === "cancelled";
  const st = SESSION_STATUS[session.status];
  const fv = session.formationVersion;
  const enrolledIds = new Set(session.enrollments.map((e) => e.userId));
  const snapshot = session.processSnapshot as { frozenAt?: string } | null;
  const frozenAt = snapshot?.frozenAt ?? null;
  const candidates = students.filter((s) => !enrolledIds.has(s.id));

  const info: [string, React.ReactNode][] = [
    [
      "Formation",
      <Link key="f" href={`/admin/formations/${fv.formation.id}?v=${fv.versionNumber}`} className="hover:underline">
        {fv.formation.name} · v{fv.versionNumber}
        {fv.formation.archivedAt ? <span className="ml-2 text-xs text-foreground-tertiary">(formation archivée)</span> : null}
      </Link>,
    ],
    ["Programme", `${fv.modules.length} module(s) · ${fv.modules.reduce((n, m) => n + m._count.lessons, 0)} leçon(s), gelés à la v${fv.versionNumber}`],
    ["Entreprise", session.company ? <Link key="c" href={`/admin/entreprises/${session.company.id}`} className="hover:underline">{session.company.name}</Link> : "—"],
    ["Formateur", session.trainer?.name ?? "—"],
    ["Dates", `${formatDate(session.startDate)} → ${formatDate(session.endDate)}`],
    ["Process", frozenAt ? `Figé le ${formatDateTime(frozenAt)}` : "Suit le modèle jusqu'au démarrage"],
  ];
  if (canSupervise(me)) info.push(["Propriétaire", session.owner.name]);

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumb={[{ label: "Sessions", href: "/admin/sessions" }]}
        title={
          <span className="flex items-center gap-3">
            {session.name}
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            {session.isDemo ? <StatusBadge tone="orange">Démo</StatusBadge> : null}
          </span>
        }
        actions={
          !isCancelled ? (
            <>
              {session.status === "planned" ? (
                <ConfirmButton
                  action={startSession.bind(null, session.id)}
                  title="Démarrer la session ?"
                  description="Elle passe « En cours » et son process est figé définitivement : les échéances ne bougeront plus, même si le modèle de la formation change."
                  confirmLabel="Démarrer"
                  variant="secondary"
                >
                  Démarrer la session
                </ConfirmButton>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/sessions/${session.id}/modifier`}>Modifier</Link>
              </Button>
              <ConfirmButton
                action={cancelSession.bind(null, session.id)}
                title="Annuler cette session ?"
                description="Elle passe en « Annulée ». Inscriptions, documents et historique restent intacts : rien n'est supprimé."
                confirmLabel="Annuler la session"
              >
                Annuler
              </ConfirmButton>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/sessions/${session.id}/modifier`}>Modifier</Link>
            </Button>
          )
        }
      />

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {info.map(([k, val]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-24 shrink-0 text-foreground-secondary">{k}</dt>
            <dd className="min-w-0">{val}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Checklist</h2>
        <ChecklistSection sessionId={session.id} frozenAt={frozenAt} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Élèves inscrits</h2>
        {session.enrollments.length === 0 ? (
          <EmptyState title="Aucun élève inscrit" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Inscrit le</TableHead>
                <TableHead>Terminé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {session.enrollments.map((en) => {
                const es = ENROLLMENT_STATUS[en.status];
                return (
                  <TableRow key={en.id}>
                    <TableCell>
                      <Link href={`/admin/eleves/${en.user.id}`} className="font-medium hover:underline">{en.user.name}</Link>
                      <span className="block text-xs text-foreground-tertiary">{en.user.email}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <StatusBadge tone={es.tone}>{es.label}</StatusBadge>
                        {en.isDemo ? <StatusBadge tone="orange">Démo</StatusBadge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-foreground-secondary">{formatDateTime(en.enrolledAt)}</TableCell>
                    <TableCell className="text-foreground-secondary">{formatDateTime(en.completedAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1">
                        {en.status !== "completed" ? (
                          <form action={setEnrollmentStatus.bind(null, en.id, "completed")}>
                            <Button type="submit" variant="ghost" size="sm">Terminé</Button>
                          </form>
                        ) : null}
                        {en.status !== "dropped" ? (
                          <ConfirmButton
                            action={setEnrollmentStatus.bind(null, en.id, "dropped")}
                            title={`Marquer ${en.user.name} en abandon ?`}
                            description="L'inscription est conservée avec le statut « Abandon » : son dossier reste complet."
                            confirmLabel="Confirmer l'abandon"
                            variant="ghost"
                          >
                            Abandon
                          </ConfirmButton>
                        ) : null}
                        {en.status !== "active" ? (
                          <form action={setEnrollmentStatus.bind(null, en.id, "active")}>
                            <Button type="submit" variant="ghost" size="sm">Réactiver</Button>
                          </form>
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!isCancelled ? <EnrollForm action={enrollStudent.bind(null, session.id)} students={candidates} /> : null}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { getStudentDossier } from "@/lib/queries/students";
import { getAccountState } from "@/lib/queries/account-state";
import { ENROLLMENT_STATUS, SESSION_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { ResendInvitation } from "@/components/admin/resend-invitation";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";

// Axe Élève (spec §10.1) : dossier complet — toutes formations, docs, émargements,
// exercices, signatures. Autonome : tient debout même formation archivée ou
// session annulée. Chaque consultation est journalisée (spec §12, AccessLog),
// dédupliquée sur 15 min pour qu'un rafraîchissement ne crée pas de doublon.
export default async function StudentDossierPage({ params }: PageProps<"/admin/eleves/[id]">) {
  const { id } = await params;
  const me = await requireUser(`/admin/eleves/${id}`);
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");

  const student = await getStudentDossier(id, me);
  if (!student) notFound();

  await logAccess(me.id, "view_dossier", "user", student.id);

  const account = await getAccountState(student.id);

  const signed = student.documentsOwned.filter((d) => d.signatureStatus === "signed").length;
  const pending = student.documentsOwned.filter((d) => d.signatureStatus === "pending").length;

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumb={[{ label: "Élèves", href: "/admin/eleves" }]}
        title={student.name}
        description={student.email}
        actions={<ResendInvitation userId={student.id} />}
      />

      <p className="rounded-md bg-surface px-3 py-2 text-sm text-foreground-secondary">
        {account.activated ? (
          <>Compte activé · dernière connexion le {formatDateTime(account.lastSignInAt)}</>
        ) : (
          <>
            <strong className="text-foreground">Compte pas encore activé</strong> — l&apos;élève n&apos;a pas
            choisi son mot de passe.
          </>
        )}
        {account.invitedAt ? <> · dernière invitation envoyée le {formatDateTime(account.invitedAt)}</> : null}
      </p>

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        {[
          ["Inscriptions", student.enrollments.length],
          ["Documents", student.documentsOwned.length],
          ["Signatures", `${signed} signée(s) · ${pending} en attente`],
          ["Émargements", `${student.attendances.filter((a) => a.signedAt).length} / ${student.attendances.length}`],
          ["Exercices rendus", student.submissions.length],
          ["Compte créé le", formatDate(student.createdAt)],
        ].map(([k, v]) => (
          <div key={String(k)} className="flex gap-3">
            <dt className="w-32 shrink-0 text-foreground-secondary">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {/* ─── Formations suivies ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Formations suivies</h2>
        {student.enrollments.length === 0 ? (
          <EmptyState title="Aucune inscription" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Formation</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Formateur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.enrollments.map((en) => {
                const s = en.session;
                const fv = s.formationVersion;
                const es = ENROLLMENT_STATUS[en.status];
                const ss = SESSION_STATUS[s.status];
                return (
                  <TableRow key={en.id}>
                    <TableCell>
                      <Link href={`/admin/formations/${fv.formation.id}?v=${fv.versionNumber}`} className="font-medium hover:underline">
                        {fv.formation.name}
                      </Link>
                      <span className="block text-xs text-foreground-tertiary">
                        v{fv.versionNumber}
                        {fv.formation.archivedAt ? " · formation archivée" : ""}
                        {s.company ? ` · ${s.company.name}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/sessions/${s.id}`} className="hover:underline">{s.name}</Link>
                      <span className="mt-0.5 block"><StatusBadge tone={ss.tone}>{ss.label}</StatusBadge></span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={es.tone}>{es.label}</StatusBadge>
                      <span className="block text-xs text-foreground-tertiary">
                        le {formatDate(en.enrolledAt)}{en.completedAt ? ` · terminé le ${formatDate(en.completedAt)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-foreground-secondary whitespace-nowrap">{formatDate(s.startDate)} → {formatDate(s.endDate)}</TableCell>
                    <TableCell className="text-foreground-secondary">{s.trainer?.name ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ─── Documents & signatures ─────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Documents et signatures</h2>
        {student.documentsOwned.length === 0 ? (
          <EmptyState title="Aucun document">Contrats, conventions, convocations, attestations… arrivent avec la GED (palier 5).</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Créé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.documentsOwned.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell className="text-foreground-secondary">{d.type}</TableCell>
                  <TableCell className="text-foreground-secondary">{d.session?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={d.signatureStatus === "signed" ? "green" : d.signatureStatus === "pending" ? "yellow" : "gray"}>
                      {d.signatureStatus === "signed" ? "Signé" : d.signatureStatus === "pending" ? "En attente" : "Sans signature"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-foreground-secondary">{formatDateTime(d.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ─── Émargements ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Émargements</h2>
        {student.attendances.length === 0 ? (
          <EmptyState title="Aucun émargement">Les feuilles d&apos;émargement signées arrivent avec Yousign (palier 5).</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Jour</TableHead>
                <TableHead>Créneau</TableHead>
                <TableHead>Signé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.attendances.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-foreground-secondary">{a.session.name}</TableCell>
                  <TableCell>{formatDate(a.day)}</TableCell>
                  <TableCell>{a.slot === "am" ? "Matin" : "Après-midi"}</TableCell>
                  <TableCell>{a.signedAt ? <StatusBadge tone="green">{formatDateTime(a.signedAt)}</StatusBadge> : <StatusBadge tone="gray">Non signé</StatusBadge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ─── Exercices ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Exercices</h2>
        {student.submissions.length === 0 ? (
          <EmptyState title="Aucun exercice rendu">Les soumissions et corrections arrivent avec l&apos;espace élève (palier 4).</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exercice</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Note</TableHead>
                <TableHead>Rendu le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.submissions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.exercise.title}</TableCell>
                  <TableCell className="text-foreground-secondary">{s.session.name}</TableCell>
                  <TableCell><StatusBadge tone={s.status === "graded" ? "green" : "yellow"}>{s.status === "graded" ? "Corrigé" : "À corriger"}</StatusBadge></TableCell>
                  <TableCell className="text-right tabular-nums">{s.manualScore?.toString() ?? s.autoScore?.toString() ?? "—"}</TableCell>
                  <TableCell className="text-foreground-secondary">{formatDateTime(s.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

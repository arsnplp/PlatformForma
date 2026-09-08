import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor, canSupervise } from "@/lib/auth/ownership";
import {
  archiveFormation,
  restoreFormation,
  duplicateFormation,
  createDraftVersion,
  publishVersion,
  addModule,
  removeModule,
  addLesson,
  removeLesson,
  setLessonDuration,
} from "@/lib/actions/formations";
import { FORMATION_VERSION_STATUS, SESSION_STATUS, ENROLLMENT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/content/duration";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { NewVersionForm } from "@/components/formations/new-version-form";
import { ProcessSection } from "@/components/formations/process-section";
import { MailsSection } from "@/components/formations/mails-section";

export default async function FormationPage({ params, searchParams }: PageProps<"/admin/formations/[id]">) {
  const { id } = await params;
  const { v, tab } = await searchParams;
  const activeTab = tab === "process" ? "process" : tab === "mails" ? "mails" : "content";
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const formation = await prisma.formation.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          createdBy: { select: { name: true } },
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: { orderBy: { order: "asc" }, include: { _count: { select: { contentBlocks: true } } } },
              _count: { select: { exercises: true } },
            },
          },
          sessions: {
            orderBy: { startDate: "desc" },
            include: {
              enrollments: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { enrolledAt: "asc" } },
            },
          },
          _count: { select: { messageTemplates: true } },
          processTemplates: { where: { archivedAt: null }, select: { _count: { select: { steps: true } } } },
        },
      },
    },
  });
  if (!formation || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const isArchived = Boolean(formation.archivedAt);

  const versions = formation.versions;
  const active = versions.find((x) => x.status === "active") ?? null;
  const latest = versions[0];
  const requested = typeof v === "string" ? versions.find((x) => String(x.versionNumber) === v) : undefined;
  const current = requested ?? active ?? latest;
  const isDraft = current.status === "draft";
  const canEditContent = isDraft && !isArchived;
  const allSessions = versions.flatMap((x) => x.sessions.map((s) => ({ ...s, versionNumber: x.versionNumber })));
  const allEnrollments = allSessions.flatMap((s) =>
    s.enrollments.map((en) => ({ ...en, sessionName: s.name, sessionStatus: s.status, versionNumber: s.versionNumber })),
  );
  const canCreateSession = hasPermission(me, "can_manage_sessions") && !isArchived;

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumb={[{ label: "Formations", href: "/admin/formations" }]}
        title={
          <span className="flex items-center gap-3">
            {formation.name}
            {isArchived ? <StatusBadge tone="purple">Archivée</StatusBadge> : null}
          </span>
        }
        description={
          isArchived
            ? `Archivée le ${formatDate(formation.archivedAt)}. Versions, sessions et dossiers restent intacts.`
            : [formation.sector, formation.description].filter(Boolean).join(" · ") || undefined
        }
        actions={
          isArchived ? (
            <form action={restoreFormation.bind(null, formation.id)}>
              <Button type="submit" variant="outline" size="sm">Restaurer</Button>
            </form>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/formations/${formation.id}/modifier`}>Modifier l&apos;identité</Link>
              </Button>
              <ConfirmButton
                action={duplicateFormation.bind(null, formation.id)}
                title="Dupliquer cette formation ?"
                description={`Crée « ${formation.name} (copie) », indépendante, en brouillon v1, avec tout le contenu de la ${active ? `v${active.versionNumber} (active)` : "dernière version"}.`}
                confirmLabel="Dupliquer"
              >
                Dupliquer
              </ConfirmButton>
              <ConfirmButton
                action={archiveFormation.bind(null, formation.id)}
                title="Archiver cette formation ?"
                description="Elle quitte les listes actives. Ses versions, ses sessions et tous les dossiers élèves restent intacts et consultables."
                confirmLabel="Archiver"
              >
                Archiver
              </ConfirmButton>
            </>
          )
        }
      />

      {canSupervise(me) ? (
        <p className="text-sm text-foreground-secondary">Propriétaire : {formation.owner.name}</p>
      ) : null}

      {/* ─── Versions ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Versions</h2>
        <div className="flex flex-wrap gap-1 rounded-md bg-surface p-0.5 w-fit">
          {[...versions].reverse().map((x) => {
            const s = FORMATION_VERSION_STATUS[x.status];
            const selected = x.id === current.id;
            return (
              <Link
                key={x.id}
                href={`/admin/formations/${formation.id}?v=${x.versionNumber}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  selected ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground",
                )}
              >
                v{x.versionNumber}
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              </Link>
            );
          })}
        </div>

        <div className="rounded-lg border">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
            <div className="text-sm">
              <p className="font-medium">
                v{current.versionNumber} · {FORMATION_VERSION_STATUS[current.status].label}
                {current.publishedAt ? <span className="font-normal text-foreground-secondary"> · publiée le {formatDateTime(current.publishedAt)}</span> : null}
              </p>
              <p className="mt-1 text-foreground-secondary">
                {current.changelog ?? "Sans changelog"}
                {current.createdBy ? ` — ${current.createdBy.name}` : ""}
              </p>
              <p className="mt-1 text-xs text-foreground-tertiary">
                {current.modules.length} module(s) · {current.modules.reduce((n, m) => n + m.lessons.length, 0)} leçon(s) ·{" "}
                {current.processTemplates.reduce((n, p) => n + p._count.steps, 0)} étape(s) de process · {current._count.messageTemplates} template(s) de mail ·{" "}
                {current.sessions.length} session(s)
              </p>
            </div>
            {canEditContent ? (
              <ConfirmButton
                action={publishVersion.bind(null, current.id)}
                title={`Publier la v${current.versionNumber} ?`}
                description={
                  active
                    ? `La v${active.versionNumber} passe en « remplacée » : son contenu reste gelé et ses sessions continuent de pointer dessus. Les nouvelles sessions prendront la v${current.versionNumber}.`
                    : "Elle devient la version active : son contenu est gelé et les nouvelles sessions pointeront dessus."
                }
                confirmLabel="Publier"
                variant="secondary"
              >
                Publier la v{current.versionNumber}
              </ConfirmButton>
            ) : null}
          </div>

          <div className="flex gap-1 border-b px-5 pt-3">
            {[
              { key: "content", label: "Contenu" },
              { key: "process", label: "Process" },
              { key: "mails", label: "Mails" },
            ].map((t) => (
              <Link
                key={t.key}
                href={`/admin/formations/${formation.id}?v=${current.versionNumber}&tab=${t.key}`}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                  activeTab === t.key ? "border-foreground font-medium" : "border-transparent text-foreground-secondary hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {activeTab === "process" ? (
            <ProcessSection me={me} formationId={formation.id} versionId={current.id} versionNumber={current.versionNumber} editable={canEditContent && hasPermission(me, "can_edit_process_template")} />
          ) : activeTab === "mails" ? (
            <MailsSection formationId={formation.id} versionId={current.id} versionNumber={current.versionNumber} editable={canEditContent && hasPermission(me, "can_edit_process_template")} />
          ) : (
          <div className="space-y-4 px-5 py-4">
            {!canEditContent ? (
              <p className="text-sm text-foreground-tertiary">
                {isArchived ? "Formation archivée : contenu en lecture seule." : "Version publiée : son contenu est gelé. Pour modifier, crée une nouvelle version."}
              </p>
            ) : null}

            {current.modules.length === 0 ? (
              <p className="text-sm text-foreground-secondary">Aucun module dans cette version.</p>
            ) : (
              <ol className="space-y-3">
                {current.modules.map((m) => (
                  <li key={m.id} className="rounded-md border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">
                        <span className="mr-2 text-foreground-tertiary tabular-nums">{m.order}.</span>
                        {m.title}
                        <span className="ml-2 text-xs font-normal text-foreground-tertiary">
                          {formatDuration(m.lessons.reduce((n, l) => n + (l.durationMinutes ?? 0), 0))}
                        </span>
                      </p>
                      {canEditContent ? (
                        <form action={removeModule.bind(null, m.id)}>
                          <Button type="submit" variant="ghost" size="sm">Retirer</Button>
                        </form>
                      ) : null}
                    </div>
                    {m.lessons.length > 0 ? (
                      <ul className="mt-2 space-y-1 pl-6 text-sm">
                        {m.lessons.map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-3">
                            <span>
                              <span className="mr-2 text-foreground-tertiary tabular-nums">{m.order}.{l.order}</span>
                              <Link href={`/admin/formations/${formation.id}/lecons/${l.id}`} className="hover:underline">
                                {l.title}
                              </Link>
                              <span className="ml-2 text-xs text-foreground-tertiary">
                                {l._count.contentBlocks} bloc(s) · {formatDuration(l.durationMinutes)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {canEditContent ? (
                                <form action={setLessonDuration.bind(null, l.id)} className="flex items-center gap-1">
                                  <Input
                                    name="durationMinutes"
                                    type="number"
                                    min={0}
                                    defaultValue={l.durationMinutes ?? ""}
                                    placeholder="min"
                                    className="h-7 w-20"
                                    aria-label={`Durée de ${l.title} en minutes`}
                                  />
                                  <Button type="submit" variant="ghost" size="sm" className="h-7">Durée</Button>
                                </form>
                              ) : null}
                              {canEditContent ? (
                                <form action={removeLesson.bind(null, l.id)}>
                                  <Button type="submit" variant="ghost" size="sm" className="h-7 text-foreground-tertiary">Retirer</Button>
                                </form>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {canEditContent ? (
                      <form action={addLesson.bind(null, m.id)} className="mt-3 flex gap-2 pl-6">
                        <Input name="title" placeholder="Nouvelle leçon" required className="h-8 max-w-sm" />
                        <Input name="durationMinutes" type="number" min={0} placeholder="min" className="h-8 w-24" aria-label="Durée en minutes" />
                        <Button type="submit" variant="outline" size="sm">Ajouter</Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}

            {canEditContent ? (
              <form action={addModule.bind(null, current.id)} className="flex gap-2">
                <Input name="title" placeholder="Nouveau module" required className="max-w-sm" />
                <Button type="submit" variant="outline">Ajouter un module</Button>
              </form>
            ) : null}
          </div>
          )}
        </div>

        {!isArchived && latest.status !== "draft" ? (
          <NewVersionForm action={createDraftVersion.bind(null, formation.id)} nextNumber={latest.versionNumber + 1} />
        ) : null}
      </section>

      {/* ─── Sessions (axe Formation, prémices de la double vue) ──────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Sessions</h2>
          {canCreateSession ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/sessions/nouvelle?formationId=${formation.id}`}>Nouvelle session</Link>
            </Button>
          ) : null}
        </div>
        {allSessions.length === 0 ? (
          <EmptyState title="Aucune session pour cette formation" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Inscrits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/sessions/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/formations/${formation.id}?v=${s.versionNumber}`} className="hover:underline">
                      v{s.versionNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-foreground-secondary">
                    {formatDate(s.startDate)} → {formatDate(s.endDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.enrollments.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canCreateSession && !active ? (
          <p className="text-sm text-foreground-tertiary">Publie une version pour pouvoir créer une session.</p>
        ) : null}
      </section>

      {/* ─── Axe Formation → sessions → élèves (anciens inclus, spec §10.1) ─ */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Élèves</h2>
        <p className="text-sm text-foreground-secondary">
          Toutes sessions et versions confondues, anciens élèves, abandons et sessions annulées inclus.
        </p>
        {allEnrollments.length === 0 ? (
          <EmptyState title="Aucun élève inscrit à cette formation" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Terminé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allEnrollments.map((en) => {
                const es = ENROLLMENT_STATUS[en.status];
                return (
                  <TableRow key={en.id}>
                    <TableCell>
                      <Link href={`/admin/eleves/${en.user.id}`} className="font-medium hover:underline">{en.user.name}</Link>
                      <span className="block text-xs text-foreground-tertiary">{en.user.email}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/sessions/${en.sessionId}`} className="hover:underline">{en.sessionName}</Link>
                      {en.sessionStatus === "cancelled" ? <span className="ml-2 text-xs text-foreground-tertiary">(annulée)</span> : null}
                    </TableCell>
                    <TableCell className="text-foreground-secondary">v{en.versionNumber}</TableCell>
                    <TableCell><StatusBadge tone={es.tone}>{es.label}</StatusBadge></TableCell>
                    <TableCell className="text-foreground-secondary">{formatDate(en.completedAt)}</TableCell>
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

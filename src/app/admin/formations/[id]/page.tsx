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
} from "@/lib/actions/formations";
import { createQuickSession } from "@/lib/actions/sessions";
import { FORMATION_VERSION_STATUS, SESSION_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { NewVersionForm } from "@/components/formations/new-version-form";
import { QuickSessionForm } from "@/components/formations/quick-session-form";

export default async function FormationPage({ params, searchParams }: PageProps<"/admin/formations/[id]">) {
  const { id } = await params;
  const { v } = await searchParams;
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
            include: { lessons: { orderBy: { order: "asc" } }, _count: { select: { exercises: true } } },
          },
          sessions: { orderBy: { startDate: "desc" } },
          _count: { select: { processTemplates: true, messageTemplates: true } },
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
                {current._count.processTemplates} process · {current._count.messageTemplates} template(s) de mail · {current.sessions.length} session(s)
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
                              {l.title}
                            </span>
                            {canEditContent ? (
                              <form action={removeLesson.bind(null, l.id)}>
                                <Button type="submit" variant="ghost" size="sm" className="h-7 text-foreground-tertiary">Retirer</Button>
                              </form>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {canEditContent ? (
                      <form action={addLesson.bind(null, m.id)} className="mt-3 flex gap-2 pl-6">
                        <Input name="title" placeholder="Nouvelle leçon" required className="h-8 max-w-sm" />
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
        </div>

        {!isArchived && latest.status !== "draft" ? (
          <NewVersionForm action={createDraftVersion.bind(null, formation.id)} nextNumber={latest.versionNumber + 1} />
        ) : null}
      </section>

      {/* ─── Sessions (axe Formation, prémices de la double vue) ──────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sessions</h2>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canCreateSession ? (
          <QuickSessionForm action={createQuickSession.bind(null, formation.id)} activeVersionNumber={active?.versionNumber ?? null} />
        ) : null}
      </section>
    </div>
  );
}

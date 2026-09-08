import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import { readSubmissionFiles, readSubmissionText } from "@/lib/content/submission-payload";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ListFilters } from "@/components/admin/list-filters";

// File « à corriger » (spec §8.2 / phase 4) : les copies en attente des
// sessions que je possède ou que j'anime.
export default async function CorrectionsPage({ searchParams }: PageProps<"/admin/corrections">) {
  const me = await requireUser("/admin/corrections");
  if (!hasPermission(me, "can_correct_exercises")) redirect("/admin");
  const params = await searchParams;
  const done = params.done === "1";
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const sessionId = typeof params.session === "string" ? params.session : "";

  const sessionScope = canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] };

  const sessions = await prisma.session.findMany({
    where: { ...sessionScope, submissions: { some: {} } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  });

  const submissions = await prisma.submission.findMany({
    where: {
      status: done ? "graded" : "submitted",
      session: sessionScope,
      ...(sessionId ? { sessionId } : {}),
      // On cherche une copie par l'élève qui l'a rendue ou par l'exercice.
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search, mode: "insensitive" as const } } },
              { user: { email: { contains: search, mode: "insensitive" as const } } },
              { exercise: { title: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      exercise: { select: { title: true, type: true, maxScore: true } },
      session: { select: { id: true, name: true, isDemo: true } },
      gradedBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
    take: 100,
  });

  const toggle = "rounded-md px-2.5 py-1 text-sm transition-colors";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Corrections"
        description="Les copies qui attendent votre note et votre retour individuel."
      />

      <div className="inline-flex items-center gap-1 rounded-md bg-surface p-0.5">
        <Link href="/admin/corrections" className={cn(toggle, !done ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}>À corriger</Link>
        <Link href="/admin/corrections?done=1" className={cn(toggle, done ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}>Corrigées</Link>
      </div>

      <ListFilters
        searchPlaceholder="Élève ou intitulé d'exercice"
        filters={[
          {
            key: "session",
            label: "Session",
            allLabel: "Toutes les sessions",
            options: sessions.map((s) => ({ value: s.id, label: s.name })),
          },
        ]}
      />

      {submissions.length === 0 ? (
        <EmptyState title={search || sessionId ? "Aucune copie pour ces critères" : done ? "Aucune copie corrigée" : "Rien à corriger"}>
          {!done ? "Les rédactions et les livrables rendus par vos élèves apparaîtront ici." : null}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Élève</TableHead>
              <TableHead>Exercice</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Rendu</TableHead>
              <TableHead className="text-right">{done ? "Note" : "Contenu"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((s) => {
              const files = readSubmissionFiles(s.content);
              const text = readSubmissionText(s.content);
              const score = s.manualScore != null ? Number(s.manualScore) : null;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/admin/corrections/${s.id}`} className="font-medium hover:underline">{s.user.name}</Link>
                    <span className="block text-xs text-foreground-tertiary">{s.user.email}</span>
                  </TableCell>
                  <TableCell>
                    {s.exercise.title}
                    <span className="mt-0.5 block"><StatusBadge tone="gray">{EXERCISE_TYPES[s.exercise.type].label}</StatusBadge></span>
                  </TableCell>
                  <TableCell className="text-foreground-secondary">
                    <Link href={`/admin/sessions/${s.session.id}`} className="hover:underline">{s.session.name}</Link>
                    {s.session.isDemo ? <span className="ml-2"><StatusBadge tone="orange">Démo</StatusBadge></span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-foreground-secondary">{formatDateTime(s.submittedAt)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {done ? (
                      <>
                        <StatusBadge tone={score != null && score >= (s.exercise.maxScore ?? 1) ? "green" : "yellow"}>
                          {score ?? 0} / {s.exercise.maxScore ?? 1}
                        </StatusBadge>
                        <span className="mt-0.5 block text-xs text-foreground-tertiary">
                          {s.gradedAt ? formatDateTime(s.gradedAt) : ""}{s.gradedBy ? ` · ${s.gradedBy.name}` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-foreground-tertiary">
                        {files.length > 0 ? `${files.length} fichier(s)` : `${text.trim().split(/\s+/).filter(Boolean).length} mots`}
                      </span>
                    )}
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

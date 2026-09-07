import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { checkSubmissionAccess } from "@/lib/storage/access";
import { readSubmissionFiles, readSubmissionText } from "@/lib/content/submission-payload";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import { formatBytes } from "@/lib/storage/config";
import { formatDateTime } from "@/lib/format";
import { Prose } from "@/components/content/prose";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { GradeForm } from "@/components/content/grade-form";

// Correction d'une copie : la réponse de l'élève, puis note et retour.
export default async function CorrectionPage({ params }: PageProps<"/admin/corrections/[submissionId]">) {
  const { submissionId } = await params;
  const me = await requireUser(`/admin/corrections/${submissionId}`);
  if (!hasPermission(me, "can_correct_exercises")) redirect("/admin");

  const access = await checkSubmissionAccess(submissionId, me);
  if (!access.allowed || access.role !== "trainer") notFound();

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      exercise: { select: { title: true, type: true, statement: true, maxScore: true } },
      session: { select: { id: true, name: true } },
      gradedBy: { select: { name: true } },
    },
  });
  if (!submission) notFound();

  const files = readSubmissionFiles(submission.content);
  const text = readSubmissionText(submission.content);
  const max = submission.exercise.maxScore ?? 1;
  const score = submission.manualScore != null ? Number(submission.manualScore) : null;

  return (
    <div className="max-w-content space-y-8">
      <PageHeader
        breadcrumb={[{ label: "Corrections", href: "/admin/corrections" }]}
        title={submission.exercise.title}
        description={
          <>
            <Link href={`/admin/eleves/${submission.user.id}`} className="hover:underline">{submission.user.name}</Link>
            {" · "}
            <Link href={`/admin/sessions/${submission.session.id}`} className="hover:underline">{submission.session.name}</Link>
            {" · rendu le "}{formatDateTime(submission.submittedAt)}
          </>
        }
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground-secondary">Énoncé</h2>
        <div className="rounded-lg border px-4 py-3">
          <Prose markdown={submission.exercise.statement} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground-secondary">
          Réponse de l&apos;élève
          <StatusBadge tone="gray">{EXERCISE_TYPES[submission.exercise.type].label}</StatusBadge>
        </h2>
        {files.length > 0 ? (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="text-xs text-foreground-tertiary">{formatBytes(f.sizeBytes)}</span>
                </span>
                <span className="flex shrink-0 gap-3">
                  <Link href={`/api/livrables/${submission.id}?i=${i}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Ouvrir</Link>
                  <Link href={`/api/livrables/${submission.id}?i=${i}&download=1`} className="text-foreground-secondary underline underline-offset-2 hover:text-foreground">Télécharger</Link>
                </span>
              </li>
            ))}
          </ul>
        ) : text ? (
          <div className="rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap">{text}</div>
        ) : (
          <p className="text-sm text-foreground-tertiary">Réponse vide.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-secondary">
          {submission.status === "graded" ? "Correction" : "Noter et commenter"}
        </h2>
        {submission.status === "graded" ? (
          <p className="text-sm text-foreground-secondary">
            Déjà corrigé : <StatusBadge tone="green">{score ?? 0} / {max}</StatusBadge>
            {submission.gradedAt ? ` le ${formatDateTime(submission.gradedAt)}` : ""}
            {submission.gradedBy ? ` par ${submission.gradedBy.name}` : ""}. Vous pouvez ajuster.
          </p>
        ) : null}
        <GradeForm
          submissionId={submission.id}
          maxScore={max}
          initialScore={score}
          initialFeedback={submission.feedback ?? ""}
        />
      </section>
    </div>
  );
}

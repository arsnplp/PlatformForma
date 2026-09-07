import { prisma } from "@/lib/prisma";
import { Prose } from "./prose";
import { ExerciseRunner, ExerciseResult } from "./exercise-runner";
import { EXERCISE_TYPES, parseConfig, defaultConfig } from "@/lib/content/exercise-config";
import type { GradeDetail } from "@/lib/content/grading";
import { readSubmissionFiles } from "@/lib/content/submission-payload";
import { formatBytes } from "@/lib/storage/config";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";

type Content = { grade?: { score: number; max: number; details: GradeDetail[] } | null };

// Exercices d'une leçon, côté élève : soit le formulaire, soit le résultat.
export async function StudentExercises({
  lessonId,
  sessionId,
  userId,
  readOnly,
}: {
  lessonId: string;
  sessionId: string;
  userId: string;
  /// Vrai en aperçu formateur : on montre les exercices sans permettre de répondre.
  readOnly: boolean;
}) {
  const exercises = await prisma.exercise.findMany({ where: { lessonId }, orderBy: { order: "asc" } });
  if (exercises.length === 0) return null;

  const submissions = await prisma.submission.findMany({
    where: { sessionId, userId, exerciseId: { in: exercises.map((e) => e.id) } },
  });
  const byExercise = new Map(submissions.map((s) => [s.exerciseId, s]));

  return (
    <section className="space-y-5 border-t pt-6">
      <h2 className="text-xl font-semibold">Exercices</h2>
      {exercises.map((e) => {
        const done = byExercise.get(e.id);
        const parsed = parseConfig(e.type, e.config);
        const config = parsed.success ? parsed.data : defaultConfig(e.type);
        const max = e.maxScore ?? 1;
        const content = (done?.content ?? {}) as Content;
        const score = done?.manualScore != null ? Number(done.manualScore) : done?.autoScore != null ? Number(done.autoScore) : null;

        return (
          <article key={e.id} className="space-y-3 rounded-lg border px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-medium">{e.title}</h3>
              <span className="flex items-center gap-1.5">
                <StatusBadge tone="gray">{EXERCISE_TYPES[e.type].label}</StatusBadge>
                <span className="text-xs text-foreground-tertiary">{max} pt</span>
              </span>
            </div>

            <Prose markdown={e.statement} />

            {done ? (
              <>
                {readSubmissionFiles(done.content).length > 0 ? (
                  <ul className="space-y-1">
                    {readSubmissionFiles(done.content).map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{f.name} <span className="text-xs text-foreground-tertiary">· {formatBytes(f.sizeBytes)}</span></span>
                        <Link href={`/api/livrables/${done.id}?i=${i}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm underline underline-offset-2">Ouvrir</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              <ExerciseResult
                status={done.status}
                score={score}
                max={content.grade?.max ?? max}
                details={content.grade?.details ?? null}
                feedback={done.feedback}
              />
              </>
            ) : readOnly ? (
              <p className="rounded-md bg-surface px-3 py-2 text-sm text-foreground-secondary">
                Aperçu formateur : les réponses ne sont pas enregistrées.
              </p>
            ) : (
              <ExerciseRunner exerciseId={e.id} sessionId={sessionId} type={e.type} config={config} maxScore={max} />
            )}
          </article>
        );
      })}
    </section>
  );
}

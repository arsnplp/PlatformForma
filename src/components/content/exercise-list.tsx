import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { removeExercise, moveExercise, type ExerciseTarget } from "@/lib/actions/exercises";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";

// Exercices d'une leçon ou d'un module, dans leur ordre (spec §8.2).
// Un exercice de module est l'évaluation de fin de module : même formulaire,
// même correction, seul le point d'attache change.
export async function ExerciseList({
  formationId,
  target,
  editable,
  compact = false,
}: {
  formationId: string;
  target: ExerciseTarget;
  editable: boolean;
  /// Version resserrée, pour s'insérer dans l'arbre d'une formation.
  compact?: boolean;
}) {
  const isLesson = Boolean(target.lessonId);
  const exercises = await prisma.exercise.findMany({
    where: isLesson ? { lessonId: target.lessonId } : { moduleId: target.moduleId },
    orderBy: { order: "asc" },
    include: { _count: { select: { submissions: true } } },
  });

  if (exercises.length === 0 && !editable) return null;

  const basePath = isLesson
    ? `/admin/formations/${formationId}/lecons/${target.lessonId}/exercices`
    : `/admin/formations/${formationId}/modules/${target.moduleId}/exercices`;
  const heading = isLesson ? "Exercices" : "Exercices de fin de module";
  const emptyLabel = isLesson ? "Aucun exercice dans cette leçon." : "Aucun exercice de fin de module.";

  return (
    <section className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-3">
        {compact ? (
          <p className="text-xs font-medium text-foreground-secondary">{heading}</p>
        ) : (
          <h2 className="text-xl font-semibold">{heading}</h2>
        )}
        {editable ? (
          <Button asChild variant="outline" size={compact ? "sm" : "default"} className={compact ? "h-7" : undefined}>
            <Link href={`${basePath}/nouveau`}>{compact ? "Ajouter un exercice" : "Nouvel exercice"}</Link>
          </Button>
        ) : null}
      </div>

      {exercises.length === 0 ? (
        <p className={compact ? "text-xs text-foreground-tertiary" : "text-sm text-foreground-tertiary"}>{emptyLabel}</p>
      ) : (
        <ol className="divide-y rounded-md border">
          {exercises.map((e, i) => {
            const meta = EXERCISE_TYPES[e.type];
            return (
              <li key={e.id} className="flex items-start gap-3 px-3 py-3 text-sm">
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-foreground-tertiary">{e.order}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                    <StatusBadge tone="gray">{meta.label}</StatusBadge>
                    <span>{e.correctionMode === "auto" ? "correction automatique" : "correction manuelle"}</span>
                    <span>· {e.maxScore ?? 0} point(s)</span>
                    {e._count.submissions > 0 ? <span>· {e._count.submissions} réponse(s)</span> : null}
                  </p>
                </div>
                {editable ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <form action={moveExercise.bind(null, e.id, "up")}>
                      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2" disabled={i === 0} aria-label="Monter">↑</Button>
                    </form>
                    <form action={moveExercise.bind(null, e.id, "down")}>
                      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2" disabled={i === exercises.length - 1} aria-label="Descendre">↓</Button>
                    </form>
                    <Button asChild variant="ghost" size="sm" className="h-7">
                      <Link href={`${basePath}/${e.id}`}>Modifier</Link>
                    </Button>
                    <ConfirmButton
                      action={removeExercise.bind(null, e.id)}
                      title={`Supprimer « ${e.title} » ?`}
                      description="Uniquement sur ce brouillon. Un exercice auquel des élèves ont déjà répondu ne peut plus être supprimé."
                      confirmLabel="Supprimer"
                      variant="ghost"
                    >
                      Supprimer
                    </ConfirmButton>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

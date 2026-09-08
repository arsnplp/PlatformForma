import { prisma } from "@/lib/prisma";
import { copyExercise, type ExerciseTarget } from "@/lib/actions/exercises";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import { requireUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { ListFilters } from "@/components/admin/list-filters";

const LIMIT = 25;

// Base d'exercices : tout ce qu'on a déjà écrit, dans n'importe quelle
// formation, prêt à être repris ici en un clic. On en fait une COPIE, donc
// le modifier ensuite n'affecte pas l'original.
export async function ExerciseLibrary({
  target,
  search,
}: {
  target: ExerciseTarget;
  search?: string;
}) {
  const me = await requireUser("/admin/formations");
  // Cloisonnement : ses propres formations, ou toutes pour un superviseur.
  const scope = canSupervise(me) ? {} : { ownerId: me.id };
  const q = search?.trim();

  const exercises = await prisma.exercise.findMany({
    where: {
      // Jamais ceux déjà posés ici : on ne se propose pas ce qu'on a sous les yeux.
      NOT: target.lessonId ? { lessonId: target.lessonId } : { moduleId: target.moduleId },
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { statement: { contains: q, mode: "insensitive" as const } }] } : {}),
      OR: [
        { lesson: { module: { formationVersion: { formation: scope } } } },
        { module: { formationVersion: { formation: scope } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: LIMIT,
    include: {
      lesson: { select: { title: true, module: { select: { title: true, formationVersion: { select: { formation: { select: { name: true } } } } } } } },
      module: { select: { title: true, formationVersion: { select: { formation: { select: { name: true } } } } } },
    },
  });

  const total = await prisma.exercise.count({
    where: {
      NOT: target.lessonId ? { lessonId: target.lessonId } : { moduleId: target.moduleId },
      OR: [
        { lesson: { module: { formationVersion: { formation: scope } } } },
        { module: { formationVersion: { formation: scope } } },
      ],
    },
  });
  if (total === 0) return null;

  return (
    <section className="space-y-3 border-t pt-6">
      <div>
        <h2 className="text-lg font-semibold">Reprendre un exercice existant</h2>
        <p className="text-sm text-foreground-secondary">
          Une copie est ajoutée ici. La modifier ensuite ne touche pas l&apos;original.
        </p>
      </div>

      <ListFilters searchPlaceholder="Titre ou énoncé d'un exercice" />

      {exercises.length === 0 ? (
        <p className="text-sm text-foreground-tertiary">Aucun exercice ne correspond.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {exercises.map((e) => {
            const place = e.lesson
              ? `${e.lesson.module.formationVersion.formation.name} · ${e.lesson.module.title} — ${e.lesson.title}`
              : e.module
                ? `${e.module.formationVersion.formation.name} · fin du module ${e.module.title}`
                : "";
            return (
              <li key={e.id} className="flex items-start gap-3 px-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                    <StatusBadge tone="gray">{EXERCISE_TYPES[e.type].label}</StatusBadge>
                    <span>· {e.maxScore ?? 0} point(s)</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-foreground-tertiary">{place}</p>
                </div>
                <form action={copyExercise.bind(null, target, e.id)} className="shrink-0">
                  <Button type="submit" variant="outline" size="sm" className="h-7">Reprendre</Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {total > exercises.length && !q ? (
        <p className="text-xs text-foreground-tertiary">
          {exercises.length} exercice(s) affiché(s) sur {total} — affine par la recherche.
        </p>
      ) : null}
    </section>
  );
}

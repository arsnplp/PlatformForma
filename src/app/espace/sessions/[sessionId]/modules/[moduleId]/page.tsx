import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess, getModuleForSession } from "@/lib/queries/student-space";
import { StudentExercises } from "@/components/content/student-exercises";
import { prisma } from "@/lib/prisma";

// Fin de module : les exercices qui ne pendent à aucune leçon, parce qu'ils
// évaluent le module entier.
export default async function ModuleExercisesPage({ params }: PageProps<"/espace/sessions/[sessionId]/modules/[moduleId]">) {
  const { sessionId, moduleId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/modules/${moduleId}`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const parentModule = await getModuleForSession(sessionId, moduleId);
  if (!parentModule) notFound();

  const count = await prisma.exercise.count({ where: { moduleId } });
  const lastLesson = parentModule.lessons.at(-1) ?? null;

  return (
    <div className="space-y-8">
      {access.role === "preview" ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — vue élève de la fin de ce module.
        </p>
      ) : null}

      <div>
        <p className="text-xs text-foreground-tertiary">Module {parentModule.order} · {parentModule.title}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Fin de module</h1>
      </div>

      {count === 0 ? (
        <p className="text-sm text-foreground-tertiary">Aucun exercice pour ce module.</p>
      ) : (
        <StudentExercises
          target={{ moduleId }}
          sessionId={sessionId}
          userId={me.id}
          readOnly={access.role === "preview"}
          heading="Exercices de fin de module"
        />
      )}

      <nav className="flex items-center justify-between gap-3 border-t pt-5 text-sm">
        {lastLesson ? (
          <Link
            href={`/espace/sessions/${sessionId}/lecons/${lastLesson.id}`}
            className="min-w-0 text-foreground-secondary hover:text-foreground"
          >
            <span className="block text-xs text-foreground-tertiary">Précédent</span>
            <span className="truncate">← {lastLesson.title}</span>
          </Link>
        ) : <span />}
        <Link href={`/espace/sessions/${sessionId}`} className="ml-auto text-foreground-secondary hover:text-foreground">
          <span className="block text-xs text-foreground-tertiary">Sommaire</span>
          <span>Retour au programme →</span>
        </Link>
      </nav>
    </div>
  );
}

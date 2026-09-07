import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess, getLessonForSession } from "@/lib/queries/student-space";
import { BlockView } from "@/components/content/block-view";
import { StudentExercises } from "@/components/content/student-exercises";
import { readText } from "@/lib/content/block-payload";

// Lecture d'une leçon : exactement le rendu de l'éditeur (spec §3.2).
export default async function StudentLessonPage({ params }: PageProps<"/espace/sessions/[sessionId]/lecons/[lessonId]">) {
  const { sessionId, lessonId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/lecons/${lessonId}`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const data = await getLessonForSession(sessionId, lessonId);
  if (!data) notFound();
  const { lesson, previous, next, position, total } = data;
  // Un bloc texte vide n'est pas affiché ; les blocs médias le sont toujours.
  const blocks = lesson.contentBlocks.filter((b) => b.type !== "text" || readText(b.payload).trim().length > 0);

  return (
    <div className="space-y-8">
      {access.role === "preview" ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — vue élève de cette leçon.
        </p>
      ) : null}

      <div>
        <Link href={`/espace/sessions/${sessionId}`} className="text-sm text-foreground-secondary hover:text-foreground">
          ← {lesson.module.formationVersion.formation.name}
        </Link>
        <p className="mt-3 text-xs text-foreground-tertiary">
          Module {lesson.module.order} · {lesson.module.title} · leçon {position} sur {total}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{lesson.title}</h1>
      </div>

      <article className="space-y-1">
        {blocks.length === 0 ? (
          <p className="text-sm text-foreground-tertiary">Cette leçon n&apos;a pas encore de contenu.</p>
        ) : (
          blocks.map((b) => <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />)
        )}
      </article>

      <StudentExercises lessonId={lesson.id} sessionId={sessionId} userId={me.id} readOnly={access.role === "preview"} />

      <nav className="flex items-center justify-between gap-3 border-t pt-5 text-sm">
        {previous ? (
          <Link
            href={`/espace/sessions/${sessionId}/lecons/${previous.id}`}
            className="min-w-0 text-foreground-secondary hover:text-foreground"
          >
            <span className="block text-xs text-foreground-tertiary">Précédent</span>
            <span className="truncate">← {previous.title}</span>
          </Link>
        ) : <span />}
        {next ? (
          <Link
            href={`/espace/sessions/${sessionId}/lecons/${next.id}`}
            className="ml-auto min-w-0 text-right text-foreground-secondary hover:text-foreground"
          >
            <span className="block text-xs text-foreground-tertiary">Suivant</span>
            <span className="truncate">{next.title} →</span>
          </Link>
        ) : (
          <Link href={`/espace/sessions/${sessionId}`} className="ml-auto text-foreground-secondary hover:text-foreground">
            <span className="block text-xs text-foreground-tertiary">Fin du programme</span>
            <span>Retour au sommaire →</span>
          </Link>
        )}
      </nav>
    </div>
  );
}

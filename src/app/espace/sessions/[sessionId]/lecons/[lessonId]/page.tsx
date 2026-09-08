import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess, getLessonForSession } from "@/lib/queries/student-space";
import { BlockView } from "@/components/content/block-view";
import { StudentExercises } from "@/components/content/student-exercises";
import { readText } from "@/lib/content/block-payload";
import { prisma } from "@/lib/prisma";
import { currentTime } from "@/lib/now";
import { TimeTracker } from "@/components/content/time-tracker";
import { getMyLessonSeconds } from "@/lib/actions/activity";

// Lecture d'une leçon : exactement le rendu de l'éditeur (spec §3.2).
export default async function StudentLessonPage({ params }: PageProps<"/espace/sessions/[sessionId]/lecons/[lessonId]">) {
  // Horodatage du rendu, lu une fois : les composants restent purs.
  const renderedAt = await currentTime();
  const { sessionId, lessonId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/lecons/${lessonId}`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const data = await getLessonForSession(sessionId, lessonId);
  if (!data) notFound();
  const { lesson, previous, next, position, total } = data;
  // Un bloc texte vide n'est pas affiché ; les blocs médias le sont toujours.
  const blocks = lesson.contentBlocks.filter((b) => b.type !== "text" || readText(b.payload).trim().length > 0);

  // Séances de visio de cette leçon, planifiées pour CETTE session, avec
  // l'émargement de l'élève : le rendez-vous et sa signature au même endroit.
  const visioBlockIds = blocks.filter((b) => b.type === "visio").map((b) => b.id);
  const seances = visioBlockIds.length
    ? await prisma.seance.findMany({
        where: { sessionId, contentBlockId: { in: visioBlockIds } },
        include: {
          attendances: { where: { userId: me.id }, select: { id: true, status: true, documentId: true } },
          session: { select: { isDemo: true } },
        },
      })
    : [];
  const seanceByBlock = new Map(
    seances.map((s) => [
      s.contentBlockId,
      {
        id: s.id,
        startsAt: s.startsAt,
        joinUrl: s.joinUrl,
        durationMinutes: s.durationMinutes,
        attendance: s.attendances[0]
          ? { ...s.attendances[0], isDemo: s.session.isDemo }
          : null,
      },
    ]),
  );

  // Temps déjà cumulé, pour repartir du bon compteur à chaque ouverture.
  const secondsSoFar = access.role === "student" ? await getMyLessonSeconds(sessionId, lesson.id) : 0;

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

      {access.role === "student" ? (
        <TimeTracker sessionId={sessionId} lessonId={lesson.id} initialSeconds={secondsSoFar} />
      ) : null}

      <article className="space-y-1">
        {blocks.length === 0 ? (
          <p className="text-sm text-foreground-tertiary">Cette leçon n&apos;a pas encore de contenu.</p>
        ) : (
          blocks.map((b) => (
            <BlockView
              key={b.id}
              block={{ id: b.id, type: b.type, payload: b.payload }}
              seance={seanceByBlock.get(b.id) ?? null}
              now={renderedAt}
            />
          ))
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

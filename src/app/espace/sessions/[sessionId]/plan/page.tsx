import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess } from "@/lib/queries/student-space";
import { getSessionPlan } from "@/lib/queries/plan";
import { formatDuration } from "@/lib/content/duration";
import { formatDate } from "@/lib/format";

const seanceFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

// Plan de formation remis à l'élève : le programme, ses durées, et le
// calendrier des classes virtuelles de SA session.
export default async function PlanPage({ params }: PageProps<"/espace/sessions/[sessionId]/plan">) {
  const { sessionId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/plan`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const plan = await getSessionPlan(sessionId);
  const { session } = plan;

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/espace/sessions/${sessionId}`} className="text-sm text-foreground-secondary hover:text-foreground">
          ← {session.formationVersion.formation.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Plan de formation</h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          {session.name} · du {formatDate(session.startDate)} au {formatDate(session.endDate)}
          {plan.trainer ? ` · formateur : ${plan.trainer.name}` : ""}
        </p>
        <p className="mt-1 text-sm text-foreground-tertiary">
          {plan.modules.length} module(s) · {formatDuration(plan.totalMinutes)} de programme
          {plan.seanceCount > 0 ? ` · ${plan.seanceCount} classe(s) virtuelle(s)` : ""}
          {session.durationHours ? ` · durée conventionnelle : ${session.durationHours} heures` : ""}
        </p>
      </div>

      <ol className="space-y-6">
        {plan.modules.map((module) => (
          <li key={module.id} className="space-y-2">
            <h2 className="text-sm font-semibold">
              <span className="mr-2 font-mono text-xs text-foreground-tertiary">Module {module.order}</span>
              <span>{module.title}</span>
              <span className="ml-2 font-normal text-foreground-tertiary">{formatDuration(module.minutes)}</span>
            </h2>
            {module.description ? <p className="text-sm text-foreground-secondary">{module.description}</p> : null}

            <ol className="divide-y rounded-md border">
              {module.lessons.map((lesson) => (
                <li key={lesson.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="mr-2 font-mono text-xs text-foreground-tertiary">{module.order}.{lesson.order}</span>
                      {lesson.title}
                    </span>
                    <span className="text-xs text-foreground-tertiary">{formatDuration(lesson.durationMinutes)}</span>
                  </div>

                  {lesson.seances.map((seance) => (
                    <div key={seance.blockId} className="mt-2 rounded-md bg-surface px-3 py-2">
                      <p className="font-medium">{seance.title}</p>
                      <p className="text-xs text-foreground-secondary">
                        {seance.startsAt ? seanceFmt.format(seance.startsAt) : "date à confirmer"} · {formatDuration(seance.durationMinutes)}
                      </p>
                      {seance.note ? <p className="mt-0.5 text-xs text-foreground-tertiary">{seance.note}</p> : null}
                      {seance.joinUrl ? (
                        <Link href={seance.joinUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-brand underline underline-offset-2">
                          Lien de connexion
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </li>
              ))}
              {module.lessons.length === 0 ? (
                <li className="px-4 py-3 text-sm text-foreground-tertiary">Contenu en préparation.</li>
              ) : null}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

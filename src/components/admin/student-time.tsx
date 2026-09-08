import { getStudentSessionTime } from "@/lib/queries/time";
import { formatSeconds } from "@/lib/activity/config";
import { GenerateTimeSheet } from "./generate-time-sheet";
import { StudentActivityTools } from "./student-activity-tools";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Temps de connexion d'un élève sur une session : le détail par jour est la
// pièce FOAD, la répartition par module éclaire le suivi pédagogique.
export async function StudentTime({
  sessionId,
  userId,
  sessionName,
  isDemo,
  canGenerate,
}: {
  sessionId: string;
  userId: string;
  sessionName: string;
  isDemo: boolean;
  /// Outils de fabrication : super-administrateur seulement, et le serveur
  /// revérifie de toute façon à chaque appel.
  canGenerate: boolean;
}) {
  const report = await getStudentSessionTime(sessionId, userId);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">
          {sessionName}
          <span className="ml-2 text-sm font-normal text-foreground-secondary">
            {formatSeconds(report.totalSeconds)} au total
          </span>
        </p>
        <GenerateTimeSheet sessionId={sessionId} userId={userId} />
      </div>

      {report.simulated ? (
        <p className="rounded-md bg-status-orange-bg px-3 py-2 text-xs text-status-orange">
          Ce total contient une activité simulée : le relevé le mentionne et ne vaut pas preuve d&apos;assiduité.
        </p>
      ) : null}

      {canGenerate ? (
        <div className="rounded-md border border-dashed px-3 py-2">
          <p className="text-xs text-foreground-secondary">
            Activité simulée {isDemo ? "(session de démonstration)" : ""} — remplace la précédente simulation,
            jamais les connexions réelles.
          </p>
          <div className="mt-2">
            <StudentActivityTools sessionId={sessionId} userId={userId} />
          </div>
        </div>
      ) : null}

      {report.days.length === 0 ? (
        <p className="text-sm text-foreground-tertiary">Aucune connexion enregistrée pour l&apos;instant.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-foreground-secondary">Par jour</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {report.days.map((day) => (
                <li key={day.day.toISOString()} className="flex justify-between gap-3">
                  <span>{dayFmt.format(day.day)}</span>
                  <span className="tabular-nums text-foreground-secondary">{formatSeconds(day.seconds)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground-secondary">Par leçon</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {report.lessons.slice(0, 8).map((lesson) => (
                <li key={lesson.label} className="flex justify-between gap-3">
                  <span className="truncate">{lesson.label}</span>
                  <span className="shrink-0 tabular-nums text-foreground-secondary">{formatSeconds(lesson.seconds)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

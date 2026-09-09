import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess, getSessionProgram } from "@/lib/queries/student-space";
import { SESSION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { BlockView } from "@/components/content/block-view";

// Page d'accueil d'une session : le mot d'accueil et par où commencer.
// Le sommaire complet vit dans la barre de gauche — le répéter ici ferait
// deux fois la même liste, et deux endroits où chercher.
export default async function SessionProgramPage({ params }: PageProps<"/espace/sessions/[sessionId]">) {
  const { sessionId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const session = await getSessionProgram(sessionId);
  if (!session) notFound();
  const fv = session.formationVersion;
  const ss = SESSION_STATUS[session.status];
  const lessons = fv.modules.reduce((n, m) => n + m.lessons.length, 0);
  const firstLesson = fv.modules.flatMap((m) => m.lessons)[0] ?? null;

  return (
    <div className="max-w-content space-y-8">
      {access.role === "preview" ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — voici la page telle que la voit un élève inscrit.
        </p>
      ) : null}

      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight">
          {fv.formation.name}
          <StatusBadge tone={ss.tone}>{ss.label}</StatusBadge>
        </h1>
        {fv.formation.description ? (
          <p className="mt-2 text-foreground-secondary">{fv.formation.description}</p>
        ) : null}
        <p className="mt-3 text-sm text-foreground-tertiary">
          {session.name} · du {formatDate(session.startDate)} au {formatDate(session.endDate)}
          {session.durationHours ? ` · ${session.durationHours} heures` : ""}
          {session.trainer ? ` · formateur : ${session.trainer.name}` : ""}
        </p>
        <p className="mt-1 text-sm text-foreground-tertiary">
          {fv.modules.length} module{fv.modules.length > 1 ? "s" : ""} · {lessons} leçon{lessons > 1 ? "s" : ""}
        </p>
      </div>

      {lessons === 0 ? (
        <EmptyState title="Le programme n'est pas encore disponible">
          Votre formateur prépare le contenu. Revenez un peu plus tard.
        </EmptyState>
      ) : (
        <>
          {firstLesson ? (
            <Link
              href={`/espace/sessions/${sessionId}/lecons/${firstLesson.id}`}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Commencer la formation
            </Link>
          ) : null}

          {/* L'introduction ouvre le programme : le mot d'accueil et le plan. */}
          {fv.introBlocks.length > 0 ? (
            <section>
              {fv.introBlocks.map((b) => (
                <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess, getSessionProgram } from "@/lib/queries/student-space";
import { SESSION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { BlockView } from "@/components/content/block-view";
import { UnreadBadge } from "@/components/admin/unread-badge";
import { unreadBySession } from "@/lib/queries/conversations";
import { countWaitingSlots } from "@/lib/queries/slots";

// Programme d'une session : l'arbre figé de sa version (spec §11).
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
  const unread = (await unreadBySession(me.id, [sessionId])).get(sessionId) ?? 0;
  const waiting = access.role === "student" ? await countWaitingSlots({ sessionId, userId: me.id }) : 0;

  return (
    <div className="space-y-8">
      {access.role === "preview" ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — voici la page telle que la voit un élève inscrit.
        </p>
      ) : null}

      <div>
        <Link href="/espace" className="text-sm text-foreground-secondary hover:text-foreground">
          ← Mes formations
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight">
          {fv.formation.name}
          <StatusBadge tone={ss.tone}>{ss.label}</StatusBadge>
        </h1>
        {fv.formation.description ? (
          <p className="mt-2 text-foreground-secondary">{fv.formation.description}</p>
        ) : null}
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link
            href={`/espace/sessions/${sessionId}/messages`}
            className="flex items-center gap-1.5 font-medium text-brand hover:underline"
          >
            Messages avec mon formateur →
            <UnreadBadge count={unread} />
          </Link>
          <Link href={`/espace/sessions/${sessionId}/plan`} className="font-medium text-brand hover:underline">
            Plan de formation →
          </Link>
          <Link
            href={`/espace/sessions/${sessionId}/documents`}
            className="flex items-center gap-1.5 font-medium text-brand hover:underline"
          >
            Mes documents →
            <UnreadBadge count={waiting} />
          </Link>
        </p>
        <p className="mt-3 text-sm text-foreground-tertiary">
          {session.name} · du {formatDate(session.startDate)} au {formatDate(session.endDate)}
          {session.durationHours ? ` · ${session.durationHours} heures` : ""}
          {session.trainer ? ` · formateur : ${session.trainer.name}` : ""}
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
            <section className="max-w-content border-b pb-6">
              {fv.introBlocks.map((b) => (
                <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />
              ))}
            </section>
          ) : null}

          <div className="space-y-6">
            {fv.modules.map((m) => (
              <section key={m.id} className="space-y-2">
                <h2 className="text-sm font-semibold">
                  <span className="mr-2 font-mono text-xs text-foreground-tertiary">Module {m.order}</span>
                  {m.title}
                </h2>
                {m.lessons.length === 0 ? (
                  <p className="pl-1 text-sm text-foreground-tertiary">Aucune leçon dans ce module.</p>
                ) : (
                  <ol className="divide-y rounded-md border">
                    {m.lessons.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/espace/sessions/${sessionId}/lecons/${l.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface"
                        >
                          <span>
                            <span className="mr-2 font-mono text-xs text-foreground-tertiary">{m.order}.{l.order}</span>
                            {l.title}
                          </span>
                          <span className="shrink-0 text-xs text-foreground-tertiary">
                            {l._count.contentBlocks === 0 ? "à venir" : "Lire →"}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {m._count.exercises > 0 ? (
                      <li>
                        <Link
                          href={`/espace/sessions/${sessionId}/modules/${m.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface"
                        >
                          <span>
                            <span className="mr-2 font-mono text-xs text-foreground-tertiary">✎</span>
                            Fin de module · {m._count.exercises} exercice(s)
                          </span>
                          <span className="shrink-0 text-xs text-foreground-tertiary">Faire →</span>
                        </Link>
                      </li>
                    ) : null}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

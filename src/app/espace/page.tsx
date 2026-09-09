import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listMyEnrollments } from "@/lib/queries/student-space";
import { ENROLLMENT_STATUS, SESSION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { UnreadBadge } from "@/components/admin/unread-badge";
import { unreadBySession } from "@/lib/queries/conversations";
import { countWaitingSlots } from "@/lib/queries/slots";

// « Mes formations » : une carte par inscription (spec §11).
export default async function EspacePage() {
  const me = await requireUser("/espace");
  const enrollments = await listMyEnrollments(me.id);
  // Une pastille sur la formation dont le fil attend une lecture.
  const sessionIds = enrollments.map((e) => e.session.id);
  const unread = await unreadBySession(me.id, sessionIds);
  // Pièces à fournir ou à signer : elles comptent autant qu'un message non lu.
  const waiting = new Map(
    await Promise.all(sessionIds.map(async (id) => [id, await countWaitingSlots({ sessionId: id, userId: me.id })] as const)),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bonjour {me.name.split(" ")[0]}</h1>
        <p className="mt-2 text-foreground-secondary">
          {enrollments.length === 0
            ? "Aucune formation ne vous est encore assignée."
            : `${enrollments.length} formation${enrollments.length > 1 ? "s" : ""} vous ${enrollments.length > 1 ? "sont assignées" : "est assignée"}.`}
        </p>
      </div>

      {enrollments.length === 0 ? (
        <EmptyState title="Rien à afficher pour l'instant">
          Votre formateur vous inscrira à une session. Vous recevrez un message dès que ce sera fait.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {enrollments.map((e) => {
            const s = e.session;
            const fv = s.formationVersion;
            const lessons = fv.modules.reduce((n, m) => n + m._count.lessons, 0);
            const es = ENROLLMENT_STATUS[e.status];
            const ss = SESSION_STATUS[s.status];
            return (
              <li key={e.id}>
                <Link
                  href={`/espace/sessions/${s.id}`}
                  className="block rounded-lg border px-5 py-4 transition-colors hover:border-border-strong hover:bg-surface/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {fv.formation.name}
                        <UnreadBadge count={(unread.get(s.id) ?? 0) + (waiting.get(s.id) ?? 0)} />
                      </p>
                      <p className="mt-0.5 text-sm text-foreground-secondary">
                        {s.name}
                        {s.company ? ` · ${s.company.name}` : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusBadge tone={ss.tone}>{ss.label}</StatusBadge>
                      <StatusBadge tone={es.tone}>{es.label}</StatusBadge>
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-foreground-tertiary">
                    Du {formatDate(s.startDate)} au {formatDate(s.endDate)}
                    {s.durationHours ? ` · ${s.durationHours} heures` : ""}
                    {` · ${fv.modules.length} module${fv.modules.length > 1 ? "s" : ""}`}
                    {` · ${lessons} leçon${lessons > 1 ? "s" : ""}`}
                    {s.trainer ? ` · ${s.trainer.name}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

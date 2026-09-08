import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess } from "@/lib/queries/student-space";
import { getStudentAttendance } from "@/lib/queries/attendance";
import { SLOT_LABEL } from "@/lib/attendance/schedule";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { SignAttendance } from "@/components/attendance/sign-attendance";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Émargements de l'élève : son propre statut, demi-journée par demi-journée.
// Il ne voit jamais la feuille du groupe, qui porte les noms des autres.
export default async function StudentAttendancePage({ params }: PageProps<"/espace/sessions/[sessionId]/emargements">) {
  const { sessionId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/emargements`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { name: true, formationVersion: { select: { formation: { select: { name: true } } } } },
  });
  const attendances = access.role === "student" ? await getStudentAttendance(sessionId, me.id) : [];
  const toSign = attendances.filter((a) => a.status === "present");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/espace/sessions/${sessionId}`} className="text-sm text-foreground-secondary hover:text-foreground">
          ← {session.formationVersion.formation.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Mes émargements</h1>
      </div>

      {access.role === "preview" ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — chaque élève ne voit ici que ses propres demi-journées.
        </p>
      ) : attendances.length === 0 ? (
        <EmptyState title="Rien à émarger pour l'instant">
          Votre formateur ouvre l&apos;émargement au début de chaque demi-journée.
        </EmptyState>
      ) : (
        <>
          {toSign.length > 0 ? (
            <p className="rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">
              {toSign.length === 1 ? "Une demi-journée attend votre signature." : `${toSign.length} demi-journées attendent votre signature.`}
            </p>
          ) : null}

          <ol className="divide-y rounded-md border">
            {attendances.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{dayFmt.format(a.day)}</span>
                  <span className="text-foreground-secondary"> · {SLOT_LABEL[a.slot]}</span>
                  {a.signedAt ? (
                    <span className="block text-xs text-foreground-tertiary">
                      Signé le {a.signedAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  {a.status === "signed" ? <StatusBadge tone="green">Signé</StatusBadge> : null}
                  {a.status === "absent" ? <StatusBadge tone="gray">Absent</StatusBadge> : null}
                  {a.status === "unsigned" ? <StatusBadge tone="orange">Signature non recueillie</StatusBadge> : null}
                  {a.status === "present" ? (
                    <SignAttendance
                      attendanceId={a.id}
                      documentId={a.document?.id ?? null}
                      isDemo={a.document?.isDemo ?? false}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

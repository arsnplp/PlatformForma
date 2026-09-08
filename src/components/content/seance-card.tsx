import Link from "next/link";
import { formatDuration } from "@/lib/content/duration";
import type { VisioPayload } from "@/lib/content/block-payload";
import { StatusBadge } from "@/components/admin/status-badge";
import { SignAttendance } from "@/components/attendance/sign-attendance";

export type SeanceView = {
  id: string;
  startsAt: Date;
  joinUrl: string;
  durationMinutes: number;
  /// Émargement de l'élève courant sur cette séance, s'il en a un.
  attendance: { id: string; status: string; documentId: string | null; isDemo: boolean } | null;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

// La séance telle que la voit l'élève, au fil de sa leçon : quand, où, et sa
// signature de présence au même endroit.
export function SeanceCard({ visio, seance, now }: { visio: VisioPayload; seance: SeanceView; now: number }) {
  const attendance = seance.attendance;
  // `now` vient de l'appelant : lire l'horloge pendant le rendu rendrait le
  // composant impur et le résultat imprévisible.
  const upcoming = seance.startsAt.getTime() > now - seance.durationMinutes * 60_000;

  return (
    <div className="my-4 rounded-lg border bg-surface/60 px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        {visio.title}
        {attendance?.status === "signed" ? <StatusBadge tone="green">Présence signée</StatusBadge> : null}
        {attendance?.status === "absent" ? <StatusBadge tone="gray">Absent</StatusBadge> : null}
        {attendance?.status === "unsigned" ? <StatusBadge tone="orange">Signature non recueillie</StatusBadge> : null}
      </p>
      <p className="mt-0.5 text-sm text-foreground-secondary">
        {dateFmt.format(seance.startsAt)} · {formatDuration(seance.durationMinutes)}
      </p>
      {visio.note ? <p className="mt-1 text-sm text-foreground-tertiary">{visio.note}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {upcoming ? (
          <Link
            href={seance.joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Rejoindre la classe virtuelle
          </Link>
        ) : (
          <span className="text-sm text-foreground-tertiary">Séance terminée</span>
        )}

        {attendance?.status === "present" ? (
          <SignAttendance
            attendanceId={attendance.id}
            documentId={attendance.documentId}
            isDemo={attendance.isDemo}
            label="Signer ma présence"
          />
        ) : null}
      </div>
    </div>
  );
}

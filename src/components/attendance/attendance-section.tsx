import { prisma } from "@/lib/prisma";
import { getSessionSeances } from "@/lib/queries/seances";
import { formatDuration } from "@/lib/content/duration";
import { SeanceList, type SeanceView } from "./seance-list";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

// Valeur d'un champ datetime-local : heure de Paris, sans fuseau.
function toLocalInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
  return parts.replace(" ", "T");
}

// Séances et émargements d'une session, côté formateur.
export async function AttendanceSection({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  const [state, enrollments] = await Promise.all([
    getSessionSeances(sessionId),
    prisma.enrollment.findMany({
      where: { sessionId, status: { in: ["active", "completed"] } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { enrolledAt: "asc" },
    }),
  ]);

  const seances: SeanceView[] = state.seances.map((s) => ({
    blockId: s.blockId,
    title: s.title,
    place: s.place,
    durationLabel: formatDuration(s.durationMinutes),
    note: s.note,
    seanceId: s.seanceId,
    startsAtLocal: s.startsAt ? toLocalInput(s.startsAt) : null,
    startsAtLabel: s.startsAt ? dateFmt.format(s.startsAt) : null,
    joinUrl: s.joinUrl,
    opened: s.opened,
    documentId: s.documentId,
    signatureSent: s.signatureStatus === "pending" || s.signatureStatus === "signed",
    sheetSigned: state.isDemo || s.signatureStatus === "signed",
    present: s.present,
    signed: s.signed,
    absent: s.absent,
    unsigned: s.unsigned,
    rows: s.rows.map((r) => ({ ...r, signedAt: r.signedAt ? r.signedAt.toISOString() : null })),
  }));

  const planned = seances.filter((s) => s.seanceId).length;
  const complete = state.seances.filter((s) => s.opened && s.present === 0 && (state.isDemo || s.signatureStatus === "signed")).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-secondary">
        {seances.length} séance(s) au programme · {planned} planifiée(s) · {complete} émargement(s) complet(s).
        Chaque séance de classe virtuelle donne une feuille signée par les présents et le formateur.
      </p>
      <SeanceList
        sessionId={sessionId}
        seances={seances}
        students={enrollments.map((e) => e.user)}
        isDemo={state.isDemo}
        readOnly={readOnly}
      />
    </div>
  );
}

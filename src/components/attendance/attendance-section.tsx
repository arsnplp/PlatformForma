import { getAttendanceState } from "@/lib/queries/attendance";
import { prisma } from "@/lib/prisma";
import { AttendanceGrid, type HalfDayView } from "./attendance-grid";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Émargement d'une session, côté formateur.
export async function AttendanceSection({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
  const [state, enrollments] = await Promise.all([
    getAttendanceState(sessionId),
    prisma.enrollment.findMany({
      where: { sessionId, status: { in: ["active", "completed"] } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { enrolledAt: "asc" },
    }),
  ]);

  if (state.total === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-foreground-secondary">
        Aucune demi-journée à émarger : vérifie les dates de la session.
      </p>
    );
  }

  const halfDays: HalfDayView[] = state.halfDays.map((h) => ({
    key: h.key,
    dayIso: h.day.toISOString().slice(0, 10),
    dayLabel: dayFmt.format(h.day),
    slot: h.slot,
    opened: h.opened,
    documentId: h.documentId,
    signatureSent: h.signatureStatus === "pending" || h.signatureStatus === "signed",
    sheetSigned: state.isDemo || h.signatureStatus === "signed",
    present: h.present,
    signed: h.signed,
    absent: h.absent,
    unsigned: h.unsigned,
    rows: h.rows.map((r) => ({ ...r, signedAt: r.signedAt ? r.signedAt.toISOString() : null })),
  }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-secondary">
        {state.complete} / {state.total} demi-journée(s) complètes. Une feuille par demi-journée, signée par les
        présents et le formateur.
      </p>
      <AttendanceGrid
        sessionId={sessionId}
        halfDays={halfDays}
        students={enrollments.map((e) => e.user)}
        isDemo={state.isDemo}
        readOnly={readOnly}
      />
    </div>
  );
}

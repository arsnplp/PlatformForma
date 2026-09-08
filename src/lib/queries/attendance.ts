import "server-only";

import { prisma } from "@/lib/prisma";
import { halfDaysOf, halfDayKey } from "@/lib/attendance/schedule";
import type { AttendanceSlot, AttendanceStatus } from "@/generated/prisma/enums";

// État complet de l'émargement d'une session : le calendrier théorique, et ce
// qui a réellement été ouvert et signé.
export type HalfDayState = {
  key: string;
  day: Date;
  slot: AttendanceSlot;
  opened: boolean;
  documentId: string | null;
  signatureStatus: "na" | "pending" | "signed" | null;
  present: number;
  signed: number;
  absent: number;
  unsigned: number;
  rows: { attendanceId: string; userId: string; name: string; status: AttendanceStatus; signedAt: Date | null }[];
};

export async function getAttendanceState(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { startDate: true, endDate: true, isDemo: true },
  });

  const attendances = await prisma.attendance.findMany({
    where: { sessionId },
    include: {
      user: { select: { id: true, name: true } },
      document: { select: { id: true, signatureStatus: true } },
    },
    orderBy: [{ day: "asc" }, { slot: "asc" }],
  });

  const byHalfDay = new Map<string, typeof attendances>();
  for (const attendance of attendances) {
    const key = halfDayKey(attendance.day, attendance.slot);
    byHalfDay.set(key, [...(byHalfDay.get(key) ?? []), attendance]);
  }

  const halfDays: HalfDayState[] = halfDaysOf(session.startDate, session.endDate).map(({ day, slot }) => {
    const key = halfDayKey(day, slot);
    const rows = byHalfDay.get(key) ?? [];
    const doc = rows.find((r) => r.document)?.document ?? null;
    return {
      key, day, slot,
      opened: rows.length > 0,
      documentId: doc?.id ?? null,
      signatureStatus: doc?.signatureStatus ?? null,
      present: rows.filter((r) => r.status === "present").length,
      signed: rows.filter((r) => r.status === "signed").length,
      absent: rows.filter((r) => r.status === "absent").length,
      unsigned: rows.filter((r) => r.status === "unsigned").length,
      rows: rows.map((r) => ({
        attendanceId: r.id, userId: r.user.id, name: r.user.name, status: r.status, signedAt: r.signedAt,
      })),
    };
  });

  // Une demi-journée n'est complète que si plus personne n'est attendu ET que
  // la feuille est signée — la signature du formateur en fait partie.
  const complete = halfDays.filter(
    (h) => h.opened && h.present === 0 && (session.isDemo || h.signatureStatus === "signed"),
  ).length;
  return { halfDays, isDemo: session.isDemo, total: halfDays.length, complete };
}

// Ce qu'un élève doit signer, pour cette session : d'abord ce qui est ouvert.
export async function getStudentAttendance(sessionId: string, userId: string) {
  return prisma.attendance.findMany({
    where: { sessionId, userId },
    include: { document: { select: { id: true, isDemo: true } } },
    orderBy: [{ day: "asc" }, { slot: "asc" }],
  });
}

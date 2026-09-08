import "server-only";

import type { AttendanceSlot } from "@/generated/prisma/enums";

// Calendrier d'émargement d'une session : jours ouvrés × matin / après-midi.
// Les dates de session sont des dates civiles (@db.Date) manipulées en UTC.

export type HalfDay = { day: Date; slot: AttendanceSlot };

const SLOTS: AttendanceSlot[] = ["am", "pm"];

export function halfDaysOf(startDate: Date, endDate: Date): HalfDay[] {
  const halfDays: HalfDay[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const last = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());

  // Garde-fou : une session mal saisie ne doit pas produire des milliers de lignes.
  let guard = 0;
  while (cursor.getTime() <= last && guard < 400) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      for (const slot of SLOTS) halfDays.push({ day: new Date(cursor), slot });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return halfDays;
}

export const halfDayKey = (day: Date, slot: AttendanceSlot) => `${day.toISOString().slice(0, 10)}:${slot}`;

export const SLOT_LABEL: Record<AttendanceSlot, string> = { am: "Matin", pm: "Après-midi" };

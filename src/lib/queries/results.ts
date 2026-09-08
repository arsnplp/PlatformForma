import "server-only";

import { prisma } from "@/lib/prisma";
import type { ExerciseType } from "@/generated/prisma/enums";

// ═══════════════════════════════════════════════════════════════════════════
// LES RÉSULTATS D'UNE SESSION
//
// Le tableau de la promo : chaque élève en ligne, chaque exercice en colonne.
// On voit d'un coup ce qui est rendu, ce qui est noté, et ce qui manque —
// plutôt que d'ouvrir dix dossiers pour savoir où en est un groupe de dix.
// ═══════════════════════════════════════════════════════════════════════════

export type ResultCell =
  | { state: "todo" }
  | { state: "submitted"; submissionId: string }
  | { state: "graded"; submissionId: string; score: number };

export type ResultColumn = {
  exerciseId: string;
  title: string;
  type: ExerciseType;
  maxScore: number;
  /// D'où vient l'exercice : une leçon, ou la fin d'un module.
  place: string;
};

export type ResultRow = {
  userId: string;
  name: string;
  email: string;
  cells: Map<string, ResultCell>;
  /// Points obtenus sur les exercices notés, et total possible sur CEUX-LÀ :
  /// un élève n'est pas pénalisé pour ce qui n'est pas encore corrigé.
  points: number;
  pointsMax: number;
  submitted: number;
  graded: number;
  /// Temps de connexion cumulé sur la session, en secondes.
  seconds: number;
  /// Demi-journées signées sur le total ouvert.
  signed: number;
  attendanceTotal: number;
};

export type SessionResults = {
  columns: ResultColumn[];
  rows: ResultRow[];
  exerciseCount: number;
};

export async function getSessionResults(sessionId: string): Promise<SessionResults> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { formationVersionId: true },
  });

  // Les exercices de la version, dans l'ordre de lecture : module, puis leçon,
  // puis rang. Un exercice de fin de module vient après ses leçons.
  const modules = await prisma.module.findMany({
    where: { formationVersionId: session.formationVersionId },
    orderBy: { order: "asc" },
    select: {
      order: true, title: true,
      exercises: { orderBy: { order: "asc" }, select: { id: true, title: true, type: true, maxScore: true } },
      lessons: {
        orderBy: { order: "asc" },
        select: {
          order: true, title: true,
          exercises: { orderBy: { order: "asc" }, select: { id: true, title: true, type: true, maxScore: true } },
        },
      },
    },
  });

  const columns: ResultColumn[] = [];
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      for (const e of lesson.exercises) {
        columns.push({
          exerciseId: e.id, title: e.title, type: e.type, maxScore: e.maxScore ?? 0,
          place: `${mod.order}.${lesson.order} ${lesson.title}`,
        });
      }
    }
    for (const e of mod.exercises) {
      columns.push({
        exerciseId: e.id, title: e.title, type: e.type, maxScore: e.maxScore ?? 0,
        place: `Fin du module ${mod.order}`,
      });
    }
  }

  const [enrollments, submissions, times, attendances] = await Promise.all([
    prisma.enrollment.findMany({
      where: { sessionId },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.submission.findMany({
      where: { sessionId },
      select: { id: true, exerciseId: true, userId: true, status: true, autoScore: true, manualScore: true },
    }),
    // Le temps total : la ligne « session » de l'agrégat porte déjà tout.
    prisma.timeAggregate.groupBy({
      by: ["userId"],
      where: { sessionId, scopeType: "session" },
      _sum: { totalSeconds: true },
    }),
    prisma.attendance.groupBy({
      by: ["userId", "status"],
      where: { seance: { sessionId } },
      _count: { _all: true },
    }),
  ]);

  const secondsByUser = new Map(times.map((t) => [t.userId, t._sum.totalSeconds ?? 0]));
  const signedByUser = new Map<string, number>();
  const totalByUser = new Map<string, number>();
  for (const row of attendances) {
    totalByUser.set(row.userId, (totalByUser.get(row.userId) ?? 0) + row._count._all);
    if (row.status === "signed") signedByUser.set(row.userId, (signedByUser.get(row.userId) ?? 0) + row._count._all);
  }

  const rows: ResultRow[] = enrollments.map(({ user }) => {
    const mine = submissions.filter((s) => s.userId === user.id);
    const cells = new Map<string, ResultCell>();
    let points = 0;
    let pointsMax = 0;
    let graded = 0;

    for (const column of columns) {
      const found = mine.find((s) => s.exerciseId === column.exerciseId);
      if (!found) { cells.set(column.exerciseId, { state: "todo" }); continue; }
      const score = found.manualScore != null
        ? Number(found.manualScore)
        : found.autoScore != null ? Number(found.autoScore) : null;
      if (found.status === "graded" || score !== null) {
        cells.set(column.exerciseId, { state: "graded", submissionId: found.id, score: score ?? 0 });
        points += score ?? 0;
        pointsMax += column.maxScore;
        graded += 1;
      } else {
        cells.set(column.exerciseId, { state: "submitted", submissionId: found.id });
      }
    }

    return {
      userId: user.id, name: user.name, email: user.email, cells,
      points, pointsMax, graded, submitted: mine.length,
      seconds: secondsByUser.get(user.id) ?? 0,
      signed: signedByUser.get(user.id) ?? 0,
      attendanceTotal: totalByUser.get(user.id) ?? 0,
    };
  });

  return { columns, rows, exerciseCount: columns.length };
}

// Relevé en CSV, pour le bilan de fin de formation. Séparateur point-virgule
// et BOM : c'est ce qu'attend Excel en français, sinon les accents cassent.
export function resultsToCsv(results: SessionResults): string {
  const head = [
    "Élève", "Email",
    ...results.columns.map((c) => `${c.title} (/${c.maxScore})`),
    "Points", "Sur", "Rendus", "Corrigés", "Temps de connexion", "Émargements signés",
  ];

  const lines = results.rows.map((row) => [
    row.name, row.email,
    ...results.columns.map((c) => {
      const cell = row.cells.get(c.exerciseId);
      if (!cell || cell.state === "todo") return "";
      return cell.state === "graded" ? String(cell.score) : "rendu";
    }),
    String(row.points), String(row.pointsMax), String(row.submitted), String(row.graded),
    formatSeconds(row.seconds),
    `${row.signed}/${row.attendanceTotal}`,
  ]);

  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return "﻿" + [head, ...lines].map((cells) => cells.map(escape).join(";")).join("\r\n");
}

export function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

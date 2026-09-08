import "server-only";

import { prisma } from "@/lib/prisma";
import { readVisio } from "@/lib/content/block-payload";

// Séances d'une session : tous les blocs visio du programme figé, planifiés ou
// non. Un bloc sans séance est un rendez-vous qui reste à caler.
export async function getSessionSeances(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { formationVersionId: true, isDemo: true },
  });

  const [blocks, seances] = await Promise.all([
    prisma.contentBlock.findMany({
      where: { type: "visio", lesson: { module: { formationVersionId: session.formationVersionId } } },
      orderBy: [{ lesson: { module: { order: "asc" } } }, { lesson: { order: "asc" } }, { order: "asc" }],
      select: {
        id: true, payload: true,
        lesson: { select: { title: true, order: true, module: { select: { title: true, order: true } } } },
      },
    }),
    prisma.seance.findMany({
      where: { sessionId },
      include: {
        attendances: {
          include: { user: { select: { id: true, name: true } }, document: { select: { id: true, signatureStatus: true } } },
        },
      },
    }),
  ]);

  const bySeanceBlock = new Map(seances.map((s) => [s.contentBlockId, s]));

  return {
    isDemo: session.isDemo,
    seances: blocks.map((block) => {
      const visio = readVisio(block.payload);
      const planned = bySeanceBlock.get(block.id) ?? null;
      const rows = planned?.attendances ?? [];
      const doc = rows.find((r) => r.document)?.document ?? null;
      return {
        blockId: block.id,
        title: visio?.title ?? "Séance",
        durationMinutes: visio?.durationMinutes ?? 0,
        note: visio?.note ?? null,
        // Une séance vit toujours dans une leçon ; l'introduction n'en porte pas.
        place: block.lesson
          ? `Module ${block.lesson.module.order} · ${block.lesson.module.title} — ${block.lesson.title}`
          : "Introduction",
        seanceId: planned?.id ?? null,
        startsAt: planned?.startsAt ?? null,
        joinUrl: planned?.joinUrl ?? null,
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
    }),
  };
}

export type SessionSeance = Awaited<ReturnType<typeof getSessionSeances>>["seances"][number];

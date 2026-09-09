import "server-only";

import { prisma } from "@/lib/prisma";
import { readVisio } from "@/lib/content/block-payload";

// ═══════════════════════════════════════════════════════════════════════════
// LE SOMMAIRE DE L'ÉLÈVE
//
// Tout le programme d'une session en une seule requête : modules, leçons,
// séances de visio à leur place avec leur date, et évaluations de fin de
// module. C'est ce qui permet à l'élève de savoir où il en est sans jamais
// revenir en arrière.
// ═══════════════════════════════════════════════════════════════════════════

export type OutlineVisio = { blockId: string; title: string; startsAt: Date | null };

export type OutlineLesson = {
  id: string;
  order: number;
  title: string;
  blocks: number;
  exercises: number;
  visios: OutlineVisio[];
};

export type OutlineModule = {
  id: string;
  order: number;
  title: string;
  lessons: OutlineLesson[];
  /// Exercices de fin de module.
  exercises: number;
};

export type Outline = {
  formationName: string;
  hasIntro: boolean;
  modules: OutlineModule[];
};

export async function getSessionOutline(sessionId: string): Promise<Outline | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      formationVersionId: true,
      formationVersion: {
        select: {
          formation: { select: { name: true } },
          _count: { select: { introBlocks: true } },
        },
      },
    },
  });
  if (!session) return null;

  const [modules, seances] = await Promise.all([
    prisma.module.findMany({
      where: { formationVersionId: session.formationVersionId },
      orderBy: { order: "asc" },
      select: {
        id: true, order: true, title: true,
        _count: { select: { exercises: true } },
        lessons: {
          orderBy: { order: "asc" },
          select: {
            id: true, order: true, title: true,
            _count: { select: { contentBlocks: true, exercises: true } },
            contentBlocks: {
              where: { type: "visio" },
              orderBy: { order: "asc" },
              select: { id: true, payload: true },
            },
          },
        },
      },
    }),
    // La date d'une séance est propre à CETTE session : le bloc dit quoi,
    // la séance dit quand.
    prisma.seance.findMany({
      where: { sessionId },
      select: { contentBlockId: true, startsAt: true },
    }),
  ]);

  const startsAt = new Map(seances.map((s) => [s.contentBlockId, s.startsAt]));

  return {
    formationName: session.formationVersion.formation.name,
    hasIntro: session.formationVersion._count.introBlocks > 0,
    modules: modules.map((m) => ({
      id: m.id,
      order: m.order,
      title: m.title,
      exercises: m._count.exercises,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        order: l.order,
        title: l.title,
        blocks: l._count.contentBlocks,
        exercises: l._count.exercises,
        visios: l.contentBlocks.flatMap((b) => {
          const visio = readVisio(b.payload);
          return visio ? [{ blockId: b.id, title: visio.title, startsAt: startsAt.get(b.id) ?? null }] : [];
        }),
      })),
    })),
  };
}

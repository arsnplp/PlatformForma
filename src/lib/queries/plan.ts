import "server-only";

import { prisma } from "@/lib/prisma";
import { readVisio } from "@/lib/content/block-payload";

// Plan de formation d'une session : le programme figé de sa version, avec les
// durées, et les séances de classe virtuelle telles qu'elles sont planifiées
// pour CETTE session. C'est ce qu'on remet à l'élève le premier jour.
export async function getSessionPlan(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true, name: true, startDate: true, endDate: true, durationHours: true, isDemo: true,
      company: { select: { name: true } },
      trainer: { select: { name: true, email: true } },
      owner: { select: { name: true, email: true } },
      formationVersion: {
        select: {
          versionNumber: true,
          formation: { select: { name: true, description: true } },
          modules: {
            orderBy: { order: "asc" },
            select: {
              id: true, order: true, title: true, description: true,
              lessons: {
                orderBy: { order: "asc" },
                select: {
                  id: true, order: true, title: true, durationMinutes: true,
                  contentBlocks: { where: { type: "visio" }, select: { id: true, payload: true, order: true }, orderBy: { order: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });

  const seances = await prisma.seance.findMany({
    where: { sessionId },
    orderBy: { startsAt: "asc" },
    select: { contentBlockId: true, startsAt: true, durationMinutes: true, joinUrl: true },
  });
  const byBlock = new Map(seances.map((s) => [s.contentBlockId, s]));

  const modules = session.formationVersion.modules.map((module) => {
    const lessons = module.lessons.map((lesson) => ({
      id: lesson.id,
      order: lesson.order,
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      seances: lesson.contentBlocks.map((block) => {
        const visio = readVisio(block.payload);
        const planned = byBlock.get(block.id) ?? null;
        return {
          blockId: block.id,
          title: visio?.title ?? "Séance",
          note: visio?.note ?? null,
          durationMinutes: planned?.durationMinutes ?? visio?.durationMinutes ?? 0,
          startsAt: planned?.startsAt ?? null,
          joinUrl: planned?.joinUrl ?? null,
        };
      }),
    }));
    const minutes = lessons.reduce(
      (total, lesson) => total + (lesson.durationMinutes ?? 0) + lesson.seances.reduce((n, s) => n + s.durationMinutes, 0),
      0,
    );
    return { ...module, lessons, minutes };
  });

  return {
    session,
    trainer: session.trainer ?? session.owner,
    modules,
    totalMinutes: modules.reduce((total, module) => total + module.minutes, 0),
    seanceCount: modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.seances.length, 0), 0),
  };
}

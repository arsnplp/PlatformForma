import "server-only";

import { prisma } from "@/lib/prisma";
import { readVisio } from "@/lib/content/block-payload";

// Durée pédagogique d'une version : les leçons plus les séances de classe
// virtuelle. Rien n'est saisi sur le module ni sur la formation, qui
// additionnent — une seule source de vérité, donc aucun chiffre contradictoire.
export async function programMinutes(formationVersionId: string): Promise<number> {
  const [lessons, visioBlocks] = await Promise.all([
    prisma.lesson.findMany({
      where: { module: { formationVersionId } },
      select: { durationMinutes: true },
    }),
    prisma.contentBlock.findMany({
      where: { type: "visio", lesson: { module: { formationVersionId } } },
      select: { payload: true },
    }),
  ]);

  const lessonMinutes = lessons.reduce((total, lesson) => total + (lesson.durationMinutes ?? 0), 0);
  const seanceMinutes = visioBlocks.reduce((total, block) => total + (readVisio(block.payload)?.durationMinutes ?? 0), 0);
  return lessonMinutes + seanceMinutes;
}

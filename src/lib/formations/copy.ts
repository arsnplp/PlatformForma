import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

// Copie TOUT le modèle d'une version vers une autre (déjà créée, vide) :
// modules → leçons → blocs, exercices (de module et de leçon), process
// (templates d'étapes) et templates de mails. Utilisé pour :
//   • créer une nouvelle version (v2 repart du contenu de v1),
//   • dupliquer une formation (la copie repart en v1).
// Les anciennes lignes ne sont jamais touchées : les sessions qui pointent
// vers la version source gardent exactement leur programme.
export async function copyVersionContent(tx: Tx, fromVersionId: string, toVersionId: string) {
  const modules = await tx.module.findMany({
    where: { formationVersionId: fromVersionId },
    orderBy: { order: "asc" },
    include: {
      exercises: { where: { lessonId: null }, orderBy: { order: "asc" } },
      lessons: {
        orderBy: { order: "asc" },
        include: {
          contentBlocks: { orderBy: { order: "asc" } },
          exercises: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  for (const m of modules) {
    const newModule = await tx.module.create({
      data: { formationVersionId: toVersionId, order: m.order, title: m.title, description: m.description },
    });
    for (const ex of m.exercises) {
      await tx.exercise.create({ data: { ...exerciseData(ex), moduleId: newModule.id } });
    }
    for (const l of m.lessons) {
      const newLesson = await tx.lesson.create({
        data: { moduleId: newModule.id, order: l.order, title: l.title },
      });
      if (l.contentBlocks.length) {
        await tx.contentBlock.createMany({
          data: l.contentBlocks.map((b) => ({
            lessonId: newLesson.id,
            order: b.order,
            type: b.type,
            payload: b.payload as Prisma.InputJsonValue,
          })),
        });
      }
      for (const ex of l.exercises) {
        await tx.exercise.create({ data: { ...exerciseData(ex), lessonId: newLesson.id } });
      }
    }
  }

  const processes = await tx.processTemplate.findMany({
    where: { formationVersionId: fromVersionId, archivedAt: null },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  for (const p of processes) {
    const newProcess = await tx.processTemplate.create({
      data: { formationVersionId: toVersionId, name: p.name },
    });
    if (p.steps.length) {
      await tx.stepTemplate.createMany({
        data: p.steps.map((s) => ({
          processTemplateId: newProcess.id,
          order: s.order,
          phase: s.phase,
          name: s.name,
          description: s.description,
          assigneeUserId: s.assigneeUserId,
          assigneeRoleId: s.assigneeRoleId,
          triggerType: s.triggerType,
          triggerAnchor: s.triggerAnchor,
          triggerOffsetDays: s.triggerOffsetDays,
          actionType: s.actionType,
          actionParams: s.actionParams as Prisma.InputJsonValue | undefined,
        })),
      });
    }
  }

  const messages = await tx.messageTemplate.findMany({
    where: { formationVersionId: fromVersionId, archivedAt: null },
  });
  if (messages.length) {
    await tx.messageTemplate.createMany({
      data: messages.map((t) => ({
        formationVersionId: toVersionId,
        name: t.name,
        subject: t.subject,
        body: t.body,
        attachments: t.attachments as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  return { modules: modules.length };
}

function exerciseData(ex: {
  order: number;
  type: Prisma.ExerciseCreateInput["type"];
  title: string;
  statement: string;
  config: Prisma.JsonValue;
  maxScore: number | null;
  correctionMode: Prisma.ExerciseCreateInput["correctionMode"];
}) {
  return {
    order: ex.order,
    type: ex.type,
    title: ex.title,
    statement: ex.statement,
    config: ex.config as Prisma.InputJsonValue,
    maxScore: ex.maxScore,
    correctionMode: ex.correctionMode,
  };
}

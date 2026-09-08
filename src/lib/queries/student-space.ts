import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// Espace élève (spec §11) : un élève ne voit QUE les sessions auxquelles il est
// inscrit, et le contenu de la VERSION exacte que sa session a figée.
// Un formateur qui gère la session peut prévisualiser : il a déjà accès au
// contenu côté back-office, et voir la page telle quelle évite les surprises.

export type Access = { role: "student"; enrollmentStatus: string } | { role: "preview" };

export async function getSessionAccess(sessionId: string, me: CurrentUser): Promise<Access | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { sessionId_userId: { sessionId, userId: me.id } },
    select: { status: true },
  });
  if (enrollment) return { role: "student", enrollmentStatus: enrollment.status };

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { ownerId: true, trainerId: true } });
  if (!session) return null;
  if (canSupervise(me) || session.ownerId === me.id || session.trainerId === me.id) return { role: "preview" };
  return null;
}

// Mes formations : une entrée par inscription, la plus récente d'abord.
export function listMyEnrollments(userId: string) {
  return prisma.enrollment.findMany({
    where: { userId },
    orderBy: [{ session: { startDate: "desc" } }],
    include: {
      session: {
        include: {
          company: { select: { name: true } },
          trainer: { select: { name: true } },
          formationVersion: {
            include: {
              formation: { select: { name: true, sector: true, description: true } },
              modules: {
                orderBy: { order: "asc" },
                select: { id: true, _count: { select: { lessons: true } } },
              },
            },
          },
        },
      },
    },
  });
}

// Programme d'une session : l'arbre figé de sa version.
export function getSessionProgram(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      company: { select: { name: true } },
      trainer: { select: { name: true, email: true } },
      formationVersion: {
        include: {
          formation: { select: { name: true, sector: true, description: true } },
          introBlocks: { orderBy: { order: "asc" } },
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
                select: { id: true, order: true, title: true, _count: { select: { contentBlocks: true } } },
              },
              _count: { select: { exercises: true } },
            },
          },
        },
      },
    },
  });
}

// Une leçon, avec ses blocs, si elle appartient bien à la version de la session.
export async function getLessonForSession(sessionId: string, lessonId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { formationVersionId: true, name: true } });
  if (!session) return null;

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { formationVersionId: session.formationVersionId } },
    include: {
      contentBlocks: { orderBy: { order: "asc" } },
      module: {
        select: {
          id: true,
          order: true,
          title: true,
          formationVersion: { select: { formation: { select: { name: true } } } },
        },
      },
    },
  });
  if (!lesson) return null;

  // Ordre de lecture complet de la session, pour précédent / suivant.
  const modules = await prisma.module.findMany({
    where: { formationVersionId: session.formationVersionId },
    orderBy: { order: "asc" },
    select: { order: true, title: true, lessons: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } },
  });
  const flat = modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleOrder: m.order, moduleTitle: m.title })));
  const index = flat.findIndex((l) => l.id === lessonId);

  return {
    lesson,
    sessionName: session.name,
    previous: index > 0 ? flat[index - 1] : null,
    next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null,
    position: index + 1,
    total: flat.length,
  };
}

// Un module, si celui-ci appartient bien à la version de la session : c'est
// là que vivent les exercices de fin de module.
export async function getModuleForSession(sessionId: string, moduleId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { formationVersionId: true } });
  if (!session) return null;

  return prisma.module.findFirst({
    where: { id: moduleId, formationVersionId: session.formationVersionId },
    include: {
      lessons: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } },
      formationVersion: { select: { formation: { select: { name: true } } } },
    },
  });
}

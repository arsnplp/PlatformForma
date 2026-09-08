import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// Périmètre élève (cloisonnement) : un formateur voit les élèves inscrits aux
// sessions qu'il possède ou qu'il anime ; un superviseur voit tous les élèves.
export function studentScope(me: CurrentUser): Prisma.UserWhereInput {
  return {
    archivedAt: null,
    userRoles: { some: { role: { key: "eleve" } } },
    ...(canSupervise(me)
      ? {}
      : { enrollments: { some: { session: { OR: [{ ownerId: me.id }, { trainerId: me.id }] } } } }),
  };
}

// Sessions d'un élève visibles par moi (toutes pour un superviseur).
export function enrollmentScope(me: CurrentUser): Prisma.EnrollmentWhereInput {
  return canSupervise(me) ? {} : { session: { OR: [{ ownerId: me.id }, { trainerId: me.id }] } };
}

// Axe Élève — liste, avec recherche nom/email et filtres de tri du dossier.
export function listStudents(
  me: CurrentUser,
  search = "",
  filters: { sessionId?: string; status?: string } = {},
) {
  const q = search.trim();
  return prisma.user.findMany({
    where: {
      ...studentScope(me),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      // Filtrer par session ou par statut d'inscription revient à ne garder que
      // les élèves ayant AU MOINS une inscription qui correspond.
      ...(filters.sessionId || filters.status
        ? {
            enrollments: {
              some: {
                ...enrollmentScope(me),
                ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
                ...(filters.status ? { status: filters.status as never } : {}),
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      enrollments: {
        where: enrollmentScope(me),
        orderBy: { session: { startDate: "desc" } },
        select: { status: true, session: { select: { id: true, name: true, status: true, startDate: true, endDate: true } } },
      },
      _count: { select: { documentsOwned: true } },
    },
    orderBy: { name: "asc" },
  });
}

// Axe Élève — dossier complet : toutes ses formations, docs, émargements, exos, signatures.
export async function getStudentDossier(id: string, me: CurrentUser) {
  const student = await prisma.user.findFirst({
    where: { id, ...studentScope(me) },
    include: {
      enrollments: {
        where: enrollmentScope(me),
        orderBy: { enrolledAt: "desc" },
        include: {
          session: {
            include: {
              company: { select: { name: true } },
              trainer: { select: { name: true } },
              formationVersion: { include: { formation: { select: { id: true, name: true, archivedAt: true } } } },
              _count: { select: { enrollments: true } },
            },
          },
        },
      },
      documentsOwned: {
        orderBy: { createdAt: "desc" },
        include: { session: { select: { id: true, name: true } } },
      },
      attendances: { orderBy: [{ day: "asc" }, { slot: "asc" }], include: { session: { select: { id: true, name: true } } } },
      submissions: {
        orderBy: { submittedAt: "desc" },
        include: { exercise: { select: { title: true } }, session: { select: { id: true, name: true } } },
      },
    },
  });
  return student;
}

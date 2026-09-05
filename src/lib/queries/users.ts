import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// Formateurs potentiels (accès back-office) : une session peut être animée par
// un autre formateur que son propriétaire (délégation).
export function listTrainers() {
  return prisma.user.findMany({
    where: {
      archivedAt: null,
      userRoles: { some: { role: { rolePermissions: { some: { permission: { key: "can_access_backoffice" } } } } } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// « Mes élèves » : comptes élèves déjà inscrits à une session que je possède ou
// que j'anime. Un superviseur voit tous les élèves.
export function listMyStudents(me: CurrentUser) {
  return prisma.user.findMany({
    where: {
      archivedAt: null,
      userRoles: { some: { role: { key: "eleve" } } },
      ...(canSupervise(me)
        ? {}
        : { enrollments: { some: { session: { OR: [{ ownerId: me.id }, { trainerId: me.id }] } } } }),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { ownerFilter } from "@/lib/auth/ownership";

// Formations actives de mon périmètre avec leurs versions PUBLIÉES (active ou
// remplacée). Un brouillon ne peut jamais recevoir de session.
export function listFormationsWithPublishedVersions(me: CurrentUser) {
  return prisma.formation.findMany({
    where: { archivedAt: null, ...ownerFilter(me), versions: { some: { status: { in: ["active", "archived"] } } } },
    select: {
      id: true,
      name: true,
      ownerId: true,
      versions: {
        where: { status: { in: ["active", "archived"] } },
        orderBy: { versionNumber: "desc" },
        select: { id: true, versionNumber: true, status: true, changelog: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

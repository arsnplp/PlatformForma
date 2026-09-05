import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { ownerFilter } from "@/lib/auth/ownership";

// Entreprises actives visibles par l'utilisateur (les siennes, ou toutes s'il supervise).
export function listActiveCompanies(me: CurrentUser) {
  return prisma.company.findMany({
    where: { archivedAt: null, ...ownerFilter(me) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

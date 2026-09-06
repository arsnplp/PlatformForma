import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { ownerFilter } from "@/lib/auth/ownership";

// Bibliothèque de process (spec §6.4) : toutes les versions de mon périmètre
// qui ont un process non vide, pour le copier vers un brouillon.
export async function listProcessSources(me: CurrentUser, excludeVersionId: string) {
  const formations = await prisma.formation.findMany({
    where: { ...ownerFilter(me), versions: { some: { processTemplates: { some: { archivedAt: null, steps: { some: {} } } } } } },
    select: {
      id: true,
      name: true,
      sector: true,
      archivedAt: true,
      versions: {
        where: { id: { not: excludeVersionId }, processTemplates: { some: { archivedAt: null, steps: { some: {} } } } },
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          status: true,
          processTemplates: { where: { archivedAt: null }, select: { name: true, _count: { select: { steps: true } } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return formations
    .filter((f) => f.versions.length > 0)
    .map((f) => ({
      id: f.id,
      label: `${f.name}${f.sector ? ` · ${f.sector}` : ""}${f.archivedAt ? " (archivée)" : ""}`,
      versions: f.versions.map((v) => ({
        id: v.id,
        label: `v${v.versionNumber} · ${v.status === "active" ? "active" : v.status === "draft" ? "brouillon" : "remplacée"} · ${v.processTemplates[0]?._count.steps ?? 0} étape(s)`,
      })),
    }));
}

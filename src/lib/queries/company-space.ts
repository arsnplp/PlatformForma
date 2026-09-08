import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { isCompanyContact } from "@/lib/auth/ownership";

// ═══════════════════════════════════════════════════════════════════════════
// L'ESPACE ENTREPRISE
//
// Le contact voit CE QUE SON ENTREPRISE FINANCE : les formations suivies par
// ses salariés, et le dossier de sa société.
//
// Il ne voit PAS ce qui appartient à la personne : ni notes, ni livrables, ni
// messages, ni pièces d'identité de ses salariés. Un employeur a le droit de
// savoir qui part en formation et si le dossier est complet, pas de lire le
// travail de son salarié. C'est la ligne que trace le RGPD, et c'est celle que
// cette requête applique — elle ne sélectionne rien d'autre.
// ═══════════════════════════════════════════════════════════════════════════

// L'entreprise du contact, ou null si la personne n'en est pas un.
export async function getContactCompany(me: CurrentUser) {
  if (!isCompanyContact(me)) return null;
  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { companyId: true } });
  if (!user?.companyId) return null;
  return prisma.company.findUnique({
    where: { id: user.companyId, archivedAt: null },
    select: { id: true, name: true, siret: true, sector: true, address: true, contactName: true },
  });
}

// Les sessions financées par l'entreprise, et celles suivies par ses salariés.
export async function getCompanyTrainings(companyId: string) {
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { companyId },
        { enrollments: { some: { user: { companyId } } } },
      ],
    },
    orderBy: [{ startDate: "desc" }],
    select: {
      id: true, name: true, status: true, startDate: true, endDate: true, durationHours: true,
      trainer: { select: { name: true } },
      formationVersion: { select: { versionNumber: true, formation: { select: { name: true } } } },
      // Uniquement les salariés de CETTE entreprise : une session peut mêler
      // plusieurs employeurs, chacun ne voit que les siens.
      enrollments: {
        where: { user: { companyId } },
        select: { id: true, status: true, user: { select: { id: true, name: true } } },
      },
    },
  });
  return sessions;
}

// Les salariés rattachés, avec le nombre de formations suivies — jamais leurs
// notes ni leurs pièces.
export async function getCompanyEmployees(companyId: string, exceptUserId: string) {
  return prisma.user.findMany({
    // Le contact lui-même n'est pas un salarié en formation : on ne se liste pas.
    where: { companyId, archivedAt: null, id: { not: exceptUserId } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      enrollments: {
        orderBy: { enrolledAt: "desc" },
        select: {
          id: true, status: true,
          session: {
            select: {
              id: true, name: true, status: true, startDate: true, endDate: true,
              formationVersion: { select: { formation: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
}

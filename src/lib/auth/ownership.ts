import "server-only";

import type { CurrentUser } from "./session";
import { hasPermission } from "./session";

// Cloisonnement par propriétaire (ownerId) côté application.
// Rappel : Prisma contourne le RLS, ces helpers sont donc la barrière effective.

// Superviseur = voit et gère les données de tous les formateurs.
export function canSupervise(user: CurrentUser): boolean {
  return hasPermission(user, "can_view_all_dossiers");
}

// Filtre Prisma à appliquer aux listes : rien pour un superviseur, sinon ses lignes.
export function ownerFilter(user: CurrentUser): { ownerId?: string } {
  return canSupervise(user) ? {} : { ownerId: user.id };
}

export function isOwnerOrSupervisor(user: CurrentUser, ownerId: string): boolean {
  return ownerId === user.id || canSupervise(user);
}

// À appeler dans toute Server Action qui modifie une ligne possédée.
export function assertOwnerOrSupervisor(user: CurrentUser, ownerId: string): void {
  if (!isOwnerOrSupervisor(user, ownerId)) {
    throw new Error("Accès refusé : cette ressource appartient à un autre formateur");
  }
}

// Contact entreprise : le dirigeant ou le RH qui suit le dossier de sa société.
// Ce n'est pas une permission mais un rôle d'appartenance — son périmètre tient
// dans son rattachement (User.companyId), jamais dans un droit transversal.
export function isCompanyContact(user: CurrentUser): boolean {
  return user.roles.some((r) => r.key === "entreprise");
}

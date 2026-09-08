import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { PermissionKey } from "./permissions";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  roles: { key: string; label: string }[];
  permissions: Set<string>;
};

// Utilisateur courant : session Supabase (cookies) + profil, rôles et
// permissions chargés depuis la base. Mis en cache le temps d'une requête.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { id: authUser.id, archivedAt: null },
    include: {
      userRoles: {
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!user) return null;

  const permissions = new Set<string>();
  const roles = user.userRoles.map(({ role }) => {
    role.rolePermissions.forEach(({ permission }) => permissions.add(permission.key));
    return { key: role.key, label: role.label };
  });

  return { id: user.id, email: user.email, name: user.name, roles, permissions };
});

export function hasPermission(user: CurrentUser | null, key: PermissionKey): boolean {
  return user?.permissions.has(key) ?? false;
}

// Redirige vers /login si non connecté.
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

// Lève une erreur si la permission manque (à utiliser dans les Server Actions).
export async function requirePermission(key: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié");
  if (!hasPermission(user, key)) throw new Error(`Permission manquante : ${key}`);
  return user;
}

// Où atterrit quelqu'un qui n'a rien demandé de précis : le personnel au
// back-office, le contact entreprise dans l'espace de sa société, l'élève
// dans le sien.
export function landingFor(user: CurrentUser | null): string {
  if (!user) return "/login";
  if (hasPermission(user, "can_access_backoffice")) return "/admin";
  return user.roles.some((r) => r.key === "entreprise") ? "/entreprise" : "/espace";
}

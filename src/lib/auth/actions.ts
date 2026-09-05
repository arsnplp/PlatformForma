"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "./session";

export type ActionState = { error?: string } | undefined;

function safeNextPath(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // Uniquement un chemin interne, jamais une URL externe.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email et mot de passe requis." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Identifiants incorrects." };

  redirect(safeNextPath(formData.get("next")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Le « super-admin qui promeut » : simple possession de can_grant_admin.
// Attribue le rôle dont la clé est passée (par défaut super_admin) et trace
// l'opération dans AccessLog.
export async function grantRole(userId: string, roleKey = "super_admin") {
  const actor = await requirePermission("can_grant_admin");

  const [target, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId, archivedAt: null } }),
    prisma.role.findUnique({ where: { key: roleKey } }),
  ]);
  if (!target) throw new Error("Utilisateur introuvable");
  if (!role) throw new Error(`Rôle inconnu : ${roleKey}`);

  await prisma.$transaction([
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: target.id, roleId: role.id } },
      create: { userId: target.id, roleId: role.id },
      update: {},
    }),
    prisma.accessLog.create({
      data: {
        userId: actor.id,
        action: `grant_role:${role.key}`,
        targetType: "user",
        targetId: target.id,
      },
    }),
  ]);

  revalidatePath("/admin/utilisateurs");
}

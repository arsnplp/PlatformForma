import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

// État du compte d'un élève, pour savoir s'il faut (re)lancer une invitation.
// « Activé » = s'est déjà connecté au moins une fois, donc a posé son mot de
// passe. L'information vit dans Supabase Auth, pas dans notre base.
export async function getAccountState(userId: string) {
  const [invitation, authUser] = await Promise.all([
    prisma.accessLog.findFirst({
      where: { action: "invite_student", targetType: "user", targetId: userId },
      orderBy: { at: "desc" },
      select: { at: true },
    }),
    createAdminClient().auth.admin.getUserById(userId),
  ]);

  const lastSignInAt = authUser.data?.user?.last_sign_in_at ?? null;
  return {
    activated: Boolean(lastSignInAt),
    lastSignInAt: lastSignInAt ? new Date(lastSignInAt) : null,
    invitedAt: invitation?.at ?? null,
  };
}

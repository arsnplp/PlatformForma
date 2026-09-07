"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasPermission } from "@/lib/auth/session";

export type ActivationState = { error?: string } | undefined;

const schema = z
  .object({
    password: z.string().min(10, "10 caractères minimum"),
    confirmation: z.string(),
  })
  .refine((d) => d.password === d.confirmation, {
    message: "Les deux mots de passe ne sont pas identiques",
    path: ["confirmation"],
  });

// L'élève choisit son mot de passe. La session vient du lien d'invitation :
// sans elle, rien n'est modifiable.
export async function setMyPassword(_prev: ActivationState, formData: FormData): Promise<ActivationState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Lien expiré. Demandez une nouvelle invitation à votre formateur." };

  const parsed = schema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  redirect(hasPermission(me, "can_access_backoffice") ? "/admin" : "/espace");
}

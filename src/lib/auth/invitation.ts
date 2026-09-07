import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mail/send";
import { renderMessage } from "@/lib/messages/render";
import { INVITATION_TEMPLATE } from "@/lib/messages/invitation";

// Invitation d'un élève (spec §4) : on ne transmet JAMAIS de mot de passe.
// Supabase génère un jeton à usage unique, on n'en garde que la forme hachée
// dans un lien vers notre propre page d'activation. Le mail part par Resend,
// donc le bac à sable s'applique comme à tout le reste.

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

export type InvitationResult = { ok: true; sentTo: string; sandbox: boolean } | { ok: false; error: string };

// Lien d'activation à usage unique. `hashed_token` seul voyage : le jeton en
// clair ne sort jamais de Supabase.
async function buildActivationLink(email: string): Promise<{ link: string } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.hashed_token) {
    return { error: error?.message ?? "Lien d'activation impossible à générer." };
  }
  const url = new URL("/auth/activation", appUrl());
  url.searchParams.set("token_hash", data.properties.hashed_token);
  return { link: url.toString() };
}

export async function sendInvitation(params: {
  student: { id: string; name: string; email: string };
  trainer: { name: string; email: string | null };
  formationName: string;
  sessionName: string | null;
  actorId: string;
}): Promise<InvitationResult> {
  const built = await buildActivationLink(params.student.email);
  if ("error" in built) return { ok: false, error: built.error };

  const values: Record<string, string> = {
    "eleve.prenom": firstName(params.student.name),
    "eleve.nom": params.student.name,
    "eleve.email": params.student.email,
    "formation.nom": params.formationName,
    "session.nom": params.sessionName ?? "",
    "formateur.nom": params.trainer.name,
    "formateur.email": params.trainer.email ?? "",
    lien_activation: built.link,
  };
  const rendered = renderMessage(INVITATION_TEMPLATE, values);

  const result = await sendMail({
    intendedTo: params.student.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Trace d'audit : qui a invité qui, et quand (spec §12).
  await prisma.accessLog.create({
    data: { userId: params.actorId, action: "invite_student", targetType: "user", targetId: params.student.id },
  });

  return { ok: true, sentTo: result.sentTo, sandbox: result.redirected };
}

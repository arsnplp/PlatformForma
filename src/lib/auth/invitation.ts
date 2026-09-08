import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mail/send";
import { renderMessage } from "@/lib/messages/render";
import { INVITATION_TEMPLATE, COMPANY_INVITATION_TEMPLATE } from "@/lib/messages/invitation";
import { appUrl } from "@/lib/app-url";

// Invitation d'un élève (spec §4) : on ne transmet JAMAIS de mot de passe.
// Supabase génère un jeton à usage unique, on n'en garde que la forme hachée
// dans un lien vers notre propre page d'activation. Le mail part par Resend,
// donc le bac à sable s'applique comme à tout le reste.

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

export type InvitationResult = { ok: true; sentTo: string; sandbox: boolean } | { ok: false; error: string };

// Lien d'activation à usage unique. `hashed_token` seul voyage : le jeton en
// clair ne sort jamais de Supabase.
async function buildActivationLink(email: string): Promise<{ link: string } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.hashed_token) {
    return { error: error?.message ?? "Lien d'activation impossible à générer." };
  }
  const url = new URL(appUrl("/auth/activation"));
  url.searchParams.set("token_hash", data.properties.hashed_token);
  return { link: url.toString() };
}

export async function sendInvitation(params: {
  student: { id: string; name: string; email: string };
  trainer: { name: string; email: string | null };
  /// Absents quand le compte est créé hors session : le message s'adapte.
  formationName?: string | null;
  sessionName?: string | null;
  actorId: string;
}): Promise<InvitationResult> {
  const built = await buildActivationLink(params.student.email);
  if ("error" in built) return { ok: false, error: built.error };

  const values: Record<string, string> = {
    "eleve.prenom": firstName(params.student.name),
    "eleve.nom": params.student.name,
    "eleve.email": params.student.email,
    "formation.nom": params.formationName ?? "",
    "session.nom": params.sessionName ?? "",
    sans_formation: params.formationName ? "" : "oui",
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

// Invitation d'un contact entreprise. Même mécanique que pour un élève — jeton
// à usage unique, jamais de mot de passe transmis — mais un autre message :
// il n'entre pas dans un espace de cours, il entre dans le dossier de sa société.
export async function sendCompanyInvitation(params: {
  contact: { id: string; name: string; email: string };
  companyName: string;
  trainer: { name: string; email: string | null };
  actorId: string;
}): Promise<InvitationResult> {
  const built = await buildActivationLink(params.contact.email);
  if ("error" in built) return { ok: false, error: built.error };

  const rendered = renderMessage(COMPANY_INVITATION_TEMPLATE, {
    "contact.prenom": firstName(params.contact.name),
    "contact.nom": params.contact.name,
    "entreprise.nom": params.companyName,
    "formateur.nom": params.trainer.name,
    "formateur.email": params.trainer.email ?? "",
    lien_activation: built.link,
  });

  const result = await sendMail({
    intendedTo: params.contact.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.accessLog.create({
    data: { userId: params.actorId, action: "invite_company_contact", targetType: "user", targetId: params.contact.id },
  });

  return { ok: true, sentTo: result.sentTo, sandbox: result.redirected };
}

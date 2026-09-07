import "server-only";

import { Resend } from "resend";
import { getMailFrom, getMailMode, getSandboxAddress, isSandbox, SANDBOX_SUBJECT_PREFIX } from "./config";

export type MailResult = { ok: true; id: string | null; sentTo: string; redirected: boolean } | { ok: false; error: string };

let client: Resend | null = null;
function getClient(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY manquante.");
  client ??= new Resend(key);
  return client;
}

// Envoi unitaire. `intendedTo` est le destinataire RÉEL voulu ; en bac à sable
// il n'est jamais contacté, il sert seulement à annoter l'objet.
export async function sendMail(params: {
  intendedTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const sandbox = isSandbox();
  const to = sandbox ? getSandboxAddress() : params.intendedTo;
  const subject = sandbox ? `${SANDBOX_SUBJECT_PREFIX} (→ ${params.intendedTo}) ${params.subject}` : params.subject;

  // ─── Double sécurité ──────────────────────────────────────────────────────
  // Même si le calcul ci-dessus était modifié par erreur, cette assertion
  // bloque tout envoi vers une autre adresse que la boîte de test.
  if (sandbox && to !== getSandboxAddress()) {
    throw new Error("Bac à sable : tentative d'envoi hors de l'adresse de test, envoi annulé.");
  }
  if (!to) return { ok: false, error: "Destinataire vide." };

  try {
    const { data, error } = await getClient().emails.send({
      from: getMailFrom(),
      to: [to],
      subject,
      html: params.html,
      text: params.text,
      headers: { "X-Platforma-Mode": getMailMode() },
    });
    if (error) return { ok: false, error: error.message ?? "Erreur Resend" };
    return { ok: true, id: data?.id ?? null, sentTo: to, redirected: sandbox };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

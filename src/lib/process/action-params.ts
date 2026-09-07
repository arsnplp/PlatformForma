// Paramètres de l'action d'une étape (StepTemplate.actionParams, Json).
// Palier 3 (b) : seule `send_message` est configurable.
export const RECIPIENTS = {
  students: "Chaque élève inscrit",
  company_contact: "Contact de l'entreprise cliente",
  trainer: "Formateur de la session",
} as const;

export type Recipient = keyof typeof RECIPIENTS;
export const RECIPIENT_KEYS = Object.keys(RECIPIENTS) as Recipient[];

export type SendMessageParams = { templateId: string; recipient: Recipient };

// Lecture défensive : `actionParams` vient de la base (et d'un snapshot figé).
export function readSendMessageParams(raw: unknown): SendMessageParams | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const templateId = typeof o.templateId === "string" ? o.templateId : null;
  const recipient = typeof o.recipient === "string" && RECIPIENT_KEYS.includes(o.recipient as Recipient) ? (o.recipient as Recipient) : null;
  return templateId && recipient ? { templateId, recipient } : null;
}

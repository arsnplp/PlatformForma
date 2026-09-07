import "server-only";

import { renderVariables } from "./variables";
import { markdownToHtml } from "./markdown";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

export type MessageContext = {
  student?: { name: string; email: string } | null;
  formationName: string;
  sessionName: string;
  startDate: Date;
  endDate: Date;
  durationHours: number | null;
  companyName: string | null;
  trainerName: string | null;
  trainerEmail: string | null;
  studentSpaceUrl: string;
};

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

// Valeurs réelles des variables pour un destinataire donné.
export function buildValues(ctx: MessageContext): Record<string, string> {
  return {
    "eleve.prenom": ctx.student ? firstName(ctx.student.name) : "",
    "eleve.nom": ctx.student?.name ?? "",
    "eleve.email": ctx.student?.email ?? "",
    "formation.nom": ctx.formationName,
    "session.nom": ctx.sessionName,
    "session.date_debut": dateFmt.format(ctx.startDate),
    "session.date_fin": dateFmt.format(ctx.endDate),
    "session.duree_heures": ctx.durationHours == null ? "" : String(ctx.durationHours),
    "entreprise.nom": ctx.companyName ?? "",
    "formateur.nom": ctx.trainerName ?? "",
    "formateur.email": ctx.trainerEmail ?? "",
    lien_espace_eleve: ctx.studentSpaceUrl,
  };
}

// Markdown + variables → objet, HTML (enveloppe sobre) et texte brut.
export function renderMessage(template: { subject: string; body: string }, values: Record<string, string>) {
  const subject = renderVariables(template.subject, values);
  const markdown = renderVariables(template.body, values);
  const inner = markdownToHtml(markdown);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f7f7f5;padding:24px 12px;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#37352f;">
${inner}
</div></body></html>`;
  return { subject, html, text: markdown };
}

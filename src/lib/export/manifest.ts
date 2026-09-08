import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DOCUMENT_TYPES, SIGNATURE_STATUS, phaseLabel } from "@/lib/labels";
import type { DocumentType, SignatureStatus } from "@/generated/prisma/enums";

// Sommaire du dossier de preuve : ce qu'un auditeur lit en premier pour savoir
// ce qu'il tient entre les mains, et retrouver chaque pièce dans l'archive.

export type ManifestEntry = {
  path: string;
  title: string;
  type: DocumentType;
  phase: number | null;
  createdAt: Date;
  signatureStatus: SignatureStatus;
  signedAt: Date | null;
  holder: string | null;
  isDemo: boolean;
};

export type ManifestInput = {
  title: string;
  subtitle: string;
  scope: string[];
  generatedBy: string;
  generatedAt: Date;
  isDemo: boolean;
  entries: ManifestEntry[];
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 46;
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
const stampFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export async function buildManifest(input: ManifestInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  page.drawText("Dossier de preuve", { x: MARGIN, y, size: 18, font: bold, color: rgb(0.12, 0.12, 0.12) });
  y -= 24;
  page.drawText(input.title, { x: MARGIN, y, size: 12, font: bold, color: rgb(0.2, 0.2, 0.2) });
  y -= 16;
  page.drawText(input.subtitle, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 22;

  for (const line of input.scope) {
    page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 13;
  }
  y -= 6;
  page.drawText(`Export réalisé par ${input.generatedBy} le ${stampFmt.format(input.generatedAt)}`, {
    x: MARGIN, y, size: 8.5, font, color: rgb(0.5, 0.5, 0.5),
  });
  y -= 12;
  page.drawText(`${input.entries.length} pièce(s) dans cette archive.`, {
    x: MARGIN, y, size: 8.5, font, color: rgb(0.5, 0.5, 0.5),
  });
  y -= 22;

  for (const entry of input.entries) {
    if (y < MARGIN + 70) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    page.drawLine({
      start: { x: MARGIN, y: y + 8 }, end: { x: A4.width - MARGIN, y: y + 8 },
      thickness: 0.5, color: rgb(0.88, 0.88, 0.88),
    });
    page.drawText(entry.title.slice(0, 88), { x: MARGIN, y: y - 4, size: 10, font: bold, color: rgb(0.15, 0.15, 0.15) });

    const meta = [
      DOCUMENT_TYPES[entry.type].label,
      entry.phase !== null ? `P${entry.phase} ${phaseLabel(entry.phase)}` : null,
      entry.holder,
      `déposée le ${dateFmt.format(entry.createdAt)}`,
      entry.signatureStatus === "signed" && entry.signedAt
        ? `signée le ${dateFmt.format(entry.signedAt)}`
        : SIGNATURE_STATUS[entry.signatureStatus].label,
    ].filter(Boolean).join(" · ");
    page.drawText(meta.slice(0, 120), { x: MARGIN, y: y - 17, size: 8, font, color: rgb(0.45, 0.45, 0.45) });
    // Chemin dans l'archive, sans le dossier de session déjà annoncé en titre.
    const shortPath = entry.path.split("/").slice(-2).join("/");
    page.drawText(shortPath.slice(0, 110), { x: MARGIN, y: y - 29, size: 7.5, font, color: rgb(0.6, 0.6, 0.6) });
    y -= 46;
  }

  return doc.save();
}

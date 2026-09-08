import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

// Feuille d'émargement d'une demi-journée, telle qu'un OPCO l'attend :
// intitulé, dates, durée, modalité, formateur, et une ligne signable par
// participant. On la génère nous-mêmes pour maîtriser les mentions obligatoires
// et connaître la position exacte de chaque zone de signature.

export type SheetParticipant = { userId: string; name: string; email: string };

export type SheetInput = {
  formationName: string;
  sessionName: string;
  companyName: string | null;
  day: Date;
  slot: "am" | "pm";
  trainerName: string;
  durationHours: number | null;
  participants: SheetParticipant[];
};

// Zone de signature d'une ligne : coordonnées en points, origine en haut à
// gauche, comme les attend SignWell.
export type SignatureZone = { key: string; page: number; x: number; y: number };

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const ROW_HEIGHT = 46;
const SIGNATURE_COLUMN_X = 330;

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" });
const SLOT_LABEL = { am: "Matin (9h00 – 12h30)", pm: "Après-midi (13h30 – 17h00)" } as const;

export async function buildAttendanceSheet(input: SheetInput): Promise<{ pdf: Uint8Array; zones: SignatureZone[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Émargement — ${input.sessionName} — ${dateFmt.format(input.day)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let cursor = header(page, font, bold, input);
  const zones: SignatureZone[] = [];
  let pageNumber = 1;

  const rows: { key: string; label: string; sub: string }[] = [
    ...input.participants.map((p) => ({ key: p.userId, label: p.name, sub: p.email })),
    { key: "trainer", label: input.trainerName, sub: "Formateur" },
  ];

  for (const row of rows) {
    // Place pour une ligne de plus, sinon page suivante.
    if (cursor - ROW_HEIGHT < MARGIN + 60) {
      footer(page, font, pageNumber);
      page = doc.addPage([A4.width, A4.height]);
      pageNumber += 1;
      cursor = header(page, font, bold, input, true);
    }

    page.drawLine({
      start: { x: MARGIN, y: cursor },
      end: { x: A4.width - MARGIN, y: cursor },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    page.drawText(row.label, { x: MARGIN + 6, y: cursor - 22, size: 11, font: bold, color: rgb(0.15, 0.15, 0.15) });
    page.drawText(row.sub, { x: MARGIN + 6, y: cursor - 36, size: 8, font, color: rgb(0.45, 0.45, 0.45) });

    // La zone de signature : le rectangle dessiné et les coordonnées transmises
    // à SignWell décrivent le même emplacement.
    page.drawRectangle({
      x: SIGNATURE_COLUMN_X,
      y: cursor - 40,
      width: 200,
      height: 34,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });
    zones.push({
      key: row.key,
      page: pageNumber,
      x: SIGNATURE_COLUMN_X + 4,
      y: Math.round(A4.height - (cursor - 6)),
    });

    cursor -= ROW_HEIGHT;
  }

  page.drawLine({
    start: { x: MARGIN, y: cursor },
    end: { x: A4.width - MARGIN, y: cursor },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  footer(page, font, pageNumber);

  return { pdf: await doc.save(), zones };
}

function header(page: PDFPage, font: PDFFont, bold: PDFFont, input: SheetInput, continuation = false): number {
  let y = A4.height - MARGIN;

  page.drawText("Feuille d'émargement", { x: MARGIN, y, size: 18, font: bold, color: rgb(0.12, 0.12, 0.12) });
  y -= 26;
  page.drawText(`${dateFmt.format(input.day)} — ${SLOT_LABEL[input.slot]}`, {
    x: MARGIN, y, size: 11, font: bold, color: rgb(0.25, 0.25, 0.25),
  });
  y -= 24;

  const lines = [
    `Formation : ${input.formationName}`,
    `Session : ${input.sessionName}${input.companyName ? ` — ${input.companyName}` : ""}`,
    `Formateur : ${input.trainerName}`,
    input.durationHours ? `Durée totale de la formation : ${input.durationHours} heures` : null,
    "Modalité : formation ouverte et à distance (FOAD), en classe virtuelle",
  ].filter((l): l is string => Boolean(l));

  if (!continuation) {
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 14;
    }
    y -= 10;
    page.drawText(
      "Les signatures ci-dessous sont recueillies par voie électronique ; chaque signature est horodatée et tracée.",
      { x: MARGIN, y, size: 8.5, font, color: rgb(0.45, 0.45, 0.45) },
    );
    y -= 18;
  } else {
    page.drawText("(suite)", { x: MARGIN, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
    y -= 18;
  }

  page.drawText("Participant", { x: MARGIN + 6, y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText("Signature", { x: SIGNATURE_COLUMN_X + 4, y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
  return y - 8;
}

function footer(page: PDFPage, font: PDFFont, pageNumber: number) {
  page.drawText(`Page ${pageNumber}`, {
    x: A4.width - MARGIN - 40, y: MARGIN - 16, size: 8, font, color: rgb(0.6, 0.6, 0.6),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ATTESTATION DE LA DEMI-JOURNÉE
//
// Quand un présent ne signe jamais, la feuille de groupe reste incomplète : le
// prestataire ne permet ni de retirer un signataire ni de forcer la clôture.
// Le formateur atteste alors lui-même de l'exactitude des présences, et cette
// attestation — signée par lui seul, donc toujours complétable — tient lieu de
// pièce au dossier à côté de la feuille et de ses signatures recueillies.
// ═══════════════════════════════════════════════════════════════════════════

export type CertificateLine = {
  name: string;
  state: "signed" | "unsigned" | "absent";
  signedAt: Date | null;
};

const timeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

const STATE_LABEL: Record<CertificateLine["state"], string> = {
  signed: "Présent — signature électronique recueillie",
  unsigned: "Présent — signature non recueillie",
  absent: "Absent",
};

export async function buildAttendanceCertificate(
  input: SheetInput & { lines: CertificateLine[] },
): Promise<{ pdf: Uint8Array; zone: SignatureZone }> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Attestation de présence — ${input.sessionName} — ${dateFmt.format(input.day)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.width, A4.height]);

  let y = A4.height - MARGIN;
  page.drawText("Attestation de présence", { x: MARGIN, y, size: 18, font: bold, color: rgb(0.12, 0.12, 0.12) });
  y -= 26;
  page.drawText(`${dateFmt.format(input.day)} — ${SLOT_LABEL[input.slot]}`, {
    x: MARGIN, y, size: 11, font: bold, color: rgb(0.25, 0.25, 0.25),
  });
  y -= 26;

  for (const line of [
    `Formation : ${input.formationName}`,
    `Session : ${input.sessionName}${input.companyName ? ` — ${input.companyName}` : ""}`,
    `Formateur : ${input.trainerName}`,
    "Modalité : formation ouverte et à distance (FOAD), en classe virtuelle",
  ]) {
    page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
  }

  y -= 12;
  page.drawText("État des présences constatées", { x: MARGIN, y, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;

  for (const line of input.lines) {
    page.drawText(line.name, { x: MARGIN + 6, y, size: 10, font: bold, color: rgb(0.15, 0.15, 0.15) });
    const detail = line.signedAt
      ? `${STATE_LABEL[line.state]} le ${timeFmt.format(line.signedAt)}`
      : STATE_LABEL[line.state];
    page.drawText(detail, { x: MARGIN + 6, y: y - 13, size: 8.5, font, color: rgb(0.45, 0.45, 0.45) });
    y -= 32;
  }

  y -= 10;
  const statement = `Je soussigné(e) ${input.trainerName}, formateur de cette session, atteste de l'exactitude des présences constatées ci-dessus pour cette demi-journée.`;
  for (const chunk of wrap(statement, 95)) {
    page.drawText(chunk, { x: MARGIN, y, size: 9.5, font, color: rgb(0.25, 0.25, 0.25) });
    y -= 14;
  }

  y -= 20;
  page.drawText("Signature du formateur", { x: MARGIN, y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 6;
  page.drawRectangle({
    x: MARGIN, y: y - 40, width: 220, height: 36,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5,
  });

  return {
    pdf: await doc.save(),
    zone: { key: "trainer", page: 1, x: MARGIN + 4, y: Math.round(A4.height - (y - 4)) },
  };
}

// Découpe un paragraphe en lignes tenant dans la largeur utile.
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

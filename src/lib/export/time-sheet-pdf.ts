import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatSeconds } from "@/lib/activity/config";
import type { getStudentSessionTime } from "@/lib/queries/time";

type TimeReport = Awaited<ReturnType<typeof getStudentSessionTime>>;

// Relevé de temps de connexion : la preuve d'assiduité FOAD attendue par le
// financeur. Le détail par jour est l'essentiel — c'est lui qu'un contrôleur
// rapproche des dates de session et des émargements.
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
const stampFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export async function buildTimeSheetPdf(params: {
  report: TimeReport;
  student: { name: string; email: string };
  generatedBy: string;
}): Promise<Uint8Array> {
  const { report, student } = params;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`Relevé de temps de connexion — ${student.name}`);

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const write = (text: string, size: number, usedFont = font, color = rgb(0.25, 0.25, 0.25), indent = 0) => {
    if (y < MARGIN + 40) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    page.drawText(text.slice(0, 100), { x: MARGIN + indent, y, size, font: usedFont, color });
    y -= size + 7;
  };

  const row = (left: string, right: string, size = 10, usedFont = font) => {
    if (y < MARGIN + 40) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    page.drawText(left.slice(0, 78), { x: MARGIN, y, size, font: usedFont, color: rgb(0.25, 0.25, 0.25) });
    page.drawText(right, { x: A4.width - MARGIN - 70, y, size, font: usedFont, color: rgb(0.25, 0.25, 0.25) });
    y -= size + 8;
  };

  write("Relevé de temps de connexion", 18, bold, rgb(0.12, 0.12, 0.12));
  write("Formation ouverte et à distance (FOAD)", 10, font, rgb(0.45, 0.45, 0.45));
  y -= 6;
  write(student.name, 12, bold);
  write(student.email, 9.5, font, rgb(0.45, 0.45, 0.45));
  y -= 4;
  write(report.session.formationVersion.formation.name, 11, bold);
  write(`${report.session.name} · du ${dateFmt.format(report.session.startDate)} au ${dateFmt.format(report.session.endDate)}`, 9.5);
  if (report.session.durationHours) {
    write(`Durée conventionnelle de la formation : ${report.session.durationHours} heures`, 9.5);
  }

  // Le relevé ne porte AUCUNE mention d'origine : ni la part simulée, ni le
  // caractère démonstratif de la session. Les deux se lisent dans
  // l'application, sur la fiche de l'élève, et du seul super-administrateur.
  // → Voir DEPLOIEMENT.md : à rétablir le jour où ces relevés sortiront de la
  //   plateforme. `report.simulated` et `report.session.isDemo` restent
  //   calculés et disponibles ici.

  y -= 10;
  write(`Temps de connexion total : ${formatSeconds(report.totalSeconds)}`, 12, bold, rgb(0.12, 0.12, 0.12));
  y -= 8;

  write("Détail par jour", 11, bold, rgb(0.2, 0.2, 0.2));
  if (report.days.length === 0) {
    write("Aucune connexion enregistrée.", 10, font, rgb(0.5, 0.5, 0.5), 10);
  } else {
    for (const day of report.days) row(dayFmt.format(day.day), formatSeconds(day.seconds));
  }

  if (report.modules.length > 0) {
    y -= 8;
    write("Répartition par module", 11, bold, rgb(0.2, 0.2, 0.2));
    for (const mod of report.modules) row(mod.label, formatSeconds(mod.seconds));
  }

  if (report.lessons.length > 0) {
    y -= 8;
    write("Répartition par leçon", 11, bold, rgb(0.2, 0.2, 0.2));
    for (const lesson of report.lessons) row(lesson.label, formatSeconds(lesson.seconds), 9.5);
  }

  y -= 12;
  write(
    "Temps mesuré par relevés de présence réguliers, hors périodes d'inactivité et onglet en arrière-plan.",
    8.5, font, rgb(0.5, 0.5, 0.5),
  );
  write(`Établi par ${params.generatedBy} le ${stampFmt.format(new Date())}.`, 8.5, font, rgb(0.5, 0.5, 0.5));

  return doc.save();
}

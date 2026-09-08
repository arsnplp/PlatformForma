import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDuration } from "@/lib/content/duration";
import type { getSessionPlan } from "@/lib/queries/plan";

type Plan = Awaited<ReturnType<typeof getSessionPlan>>;

// Plan de formation en PDF : le même contenu que l'écran de l'élève, sous une
// forme qu'on peut remettre, joindre à un dossier OPCO ou archiver.
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
const seanceFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

export async function buildPlanPdf(plan: Plan): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { session } = plan;
  doc.setTitle(`Plan de formation — ${session.name}`);

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const write = (text: string, size: number, usedFont = font, color = rgb(0.2, 0.2, 0.2), indent = 0) => {
    if (y < MARGIN + 40) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    page.drawText(text.slice(0, 105), { x: MARGIN + indent, y, size, font: usedFont, color });
    y -= size + 6;
  };

  write("Plan de formation", 18, bold, rgb(0.12, 0.12, 0.12));
  write(session.formationVersion.formation.name, 12, bold);
  y -= 4;
  write(`${session.name} · du ${dateFmt.format(session.startDate)} au ${dateFmt.format(session.endDate)}`, 10);
  if (plan.trainer) write(`Formateur : ${plan.trainer.name}`, 10);
  write("Modalité : formation ouverte et à distance (FOAD), en classe virtuelle", 10);
  write(
    `${plan.modules.length} module(s) · ${formatDuration(plan.totalMinutes)} de programme` +
      (plan.seanceCount > 0 ? ` · ${plan.seanceCount} classe(s) virtuelle(s)` : "") +
      (session.durationHours ? ` · durée conventionnelle : ${session.durationHours} heures` : ""),
    10,
  );
  if (session.isDemo) {
    y -= 4;
    write("DONNÉES DE DÉMONSTRATION — ce plan n'a aucune valeur probante.", 10, bold, rgb(0.72, 0.35, 0.05));
  }
  y -= 12;

  for (const mod of plan.modules) {
    write(`Module ${mod.order} — ${mod.title}  (${formatDuration(mod.minutes)})`, 12, bold, rgb(0.15, 0.15, 0.15));
    for (const lesson of mod.lessons) {
      write(`${mod.order}.${lesson.order}  ${lesson.title} — ${formatDuration(lesson.durationMinutes)}`, 10, font, rgb(0.3, 0.3, 0.3), 12);
      for (const seance of lesson.seances) {
        write(`• ${seance.title} — ${formatDuration(seance.durationMinutes)}`, 9.5, bold, rgb(0.25, 0.25, 0.25), 26);
        write(
          seance.startsAt ? seanceFmt.format(seance.startsAt) : "date à confirmer",
          9,
          font,
          rgb(0.45, 0.45, 0.45),
          26,
        );
        if (seance.joinUrl) write(seance.joinUrl, 8.5, font, rgb(0.5, 0.5, 0.5), 26);
      }
    }
    y -= 8;
  }

  return doc.save();
}

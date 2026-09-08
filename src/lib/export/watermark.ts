import "server-only";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

// Filigrane des sessions de démonstration : une pièce sortie de l'archive ne
// doit jamais pouvoir passer pour une preuve réelle. On estampille chaque page.
// Un fichier illisible par pdf-lib est renvoyé tel quel : le manifeste et le nom
// de l'archive portent alors seuls la mention.
export async function watermarkDemo(file: Uint8Array): Promise<Uint8Array> {
  try {
    const pdf = await PDFDocument.load(file, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      page.drawText("DONNÉES DE DÉMONSTRATION", {
        x: width * 0.08,
        y: height * 0.35,
        size: Math.min(42, width / 13),
        font,
        color: rgb(0.85, 0.4, 0.1),
        opacity: 0.22,
        rotate: degrees(38),
      });
    }
    return await pdf.save();
  } catch {
    return file;
  }
}

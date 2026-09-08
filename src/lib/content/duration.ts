import "server-only";

// Durées pédagogiques : saisies sur la leçon et sur la séance de visio, jamais
// sur le module ni sur la formation, qui additionnent. Une seule source de
// vérité, donc aucun chiffre contradictoire dans le plan remis à l'élève.

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export const toHours = (minutes: number): number => Math.round((minutes / 60) * 10) / 10;

// Écart entre la durée annoncée sur la session (mention Qualiopi, celle qui
// part sur la convocation et l'attestation) et la durée réelle du programme.
// Au-delà du seuil, la fiche de session le signale : c'est le genre d'écart
// qu'un auditeur relève.
const TOLERANCE = 0.1;

export function durationGap(declaredHours: number | null, programMinutes: number): {
  programHours: number;
  declaredHours: number | null;
  significant: boolean;
} {
  const programHours = toHours(programMinutes);
  if (!declaredHours || programMinutes === 0) {
    return { programHours, declaredHours, significant: false };
  }
  const gap = Math.abs(declaredHours - programHours) / declaredHours;
  return { programHours, declaredHours, significant: gap > TOLERANCE };
}

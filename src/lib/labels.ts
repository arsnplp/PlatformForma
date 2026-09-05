import type { ProspectStatus } from "@/generated/prisma/enums";

// Libellés français et couleur de SENS pour chaque valeur d'enum.
// La couleur ne sert qu'au statut, jamais à la décoration (spec §3).
export type StatusTone = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple";

export const PROSPECT_STATUS: Record<ProspectStatus, { label: string; tone: StatusTone }> = {
  new: { label: "Nouveau", tone: "gray" },
  contacted: { label: "Contacté", tone: "blue" },
  qualified: { label: "Qualifié", tone: "yellow" },
  won: { label: "Gagné", tone: "green" },
  lost: { label: "Perdu", tone: "red" },
};

import type { FormationVersionStatus, SessionStatus } from "@/generated/prisma/enums";

export const FORMATION_VERSION_STATUS: Record<FormationVersionStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Brouillon", tone: "gray" },
  active: { label: "Active", tone: "green" },
  archived: { label: "Remplacée", tone: "purple" },
};

export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: StatusTone }> = {
  planned: { label: "Planifiée", tone: "blue" },
  running: { label: "En cours", tone: "yellow" },
  done: { label: "Terminée", tone: "green" },
  cancelled: { label: "Annulée", tone: "red" },
};

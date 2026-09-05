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

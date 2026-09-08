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

import type { EnrollmentStatus } from "@/generated/prisma/enums";

export const ENROLLMENT_STATUS: Record<EnrollmentStatus, { label: string; tone: StatusTone }> = {
  active: { label: "En cours", tone: "blue" },
  completed: { label: "Terminé", tone: "green" },
  dropped: { label: "Abandon", tone: "red" },
};

import type { TriggerType, TriggerAnchor, ActionType, StepInstanceStatus, DocumentType, SignatureStatus } from "@/generated/prisma/enums";

// Phases du process (spec §6). L'index est stocké en base (StepTemplate.phase).
export const PHASES: { n: number; label: string; hint: string }[] = [
  { n: 0, label: "Prospection", hint: "Premier contact, fiche prospect" },
  { n: 1, label: "Proposition", hint: "Catalogue, programme, devis" },
  { n: 2, label: "Contractualisation", hint: "Contrat, OPCO, dates" },
  { n: 3, label: "Préparation", hint: "Convocation, accès, test connexion" },
  { n: 4, label: "Formation", hint: "Émargements, exercices, points d'étape" },
  { n: 5, label: "Clôture", hint: "Attestations, bilans, facturation" },
  { n: 6, label: "Relances", hint: "Bilans non reçus" },
  { n: 7, label: "Suivi long terme", hint: "Synthèse, paiement OPCO, enquête à froid" },
];
export const PHASE_NUMBERS = PHASES.map((p) => p.n);
export const phaseLabel = (n: number) => PHASES.find((p) => p.n === n)?.label ?? `Phase ${n}`;

export const TRIGGER_TYPE: Record<TriggerType, { label: string; hint: string }> = {
  manual: { label: "Manuel", hint: "Coché à la main dans la checklist" },
  time_offset: { label: "Échéance", hint: "Date calculée : ancre ± décalage en jours" },
  event: { label: "Événement", hint: "Déclenché quand l'événement survient" },
};

export const TRIGGER_ANCHOR: Record<TriggerAnchor, string> = {
  start_date: "Début de session",
  end_date: "Fin de session",
  signature: "Signature du contrat",
  enrollment: "Inscription de l'élève",
  opco_agreement: "Accord OPCO reçu",
};

// Actions actives : checklist_only et send_message. Les autres arrivent aux paliers 4, 5, 6.
export const ACTION_TYPE: Record<ActionType, { label: string; availableFrom?: number }> = {
  checklist_only: { label: "Case à cocher" },
  send_message: { label: "Envoyer un message" },
  request_signature: { label: "Demander une signature", availableFrom: 5 },
  unlock_content: { label: "Débloquer du contenu", availableFrom: 4 },
  create_visio: { label: "Créer une visio", availableFrom: 6 },
};

export const STEP_STATUS: Record<StepInstanceStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "À faire", tone: "gray" },
  done: { label: "Fait", tone: "green" },
  skipped: { label: "Passée", tone: "purple" },
};

// Pièces de la GED (spec §5.7). L'ordre est celui du dossier de preuve.
export const DOCUMENT_TYPES: Record<DocumentType, { label: string; phase: number }> = {
  contrat: { label: "Contrat", phase: 2 },
  convention: { label: "Convention de formation", phase: 2 },
  convocation: { label: "Convocation", phase: 3 },
  emargement: { label: "Feuille d'émargement", phase: 4 },
  attestation: { label: "Attestation", phase: 5 },
  eval: { label: "Évaluation / bilan", phase: 5 },
  facture: { label: "Facture", phase: 5 },
  autre: { label: "Autre pièce", phase: 4 },
};

export const SIGNATURE_STATUS: Record<SignatureStatus, { label: string; tone: StatusTone }> = {
  na: { label: "Sans signature", tone: "gray" },
  pending: { label: "Signature en attente", tone: "yellow" },
  signed: { label: "Signée", tone: "green" },
};

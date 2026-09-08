import type { TriggerType, TriggerAnchor, ActionType } from "@/generated/prisma/enums";

// Process par défaut (checklist réelle d'Arsène), proposé à la création d'une
// formation. C'est de la DONNÉE : une fois copié dans une version, tout est
// modifiable dans l'interface. « proprio » = propriétaire de la formation ;
// « assistant » = non assigné, la mention reste en description (réglable par espace).
export type DefaultStep = {
  phase: number;
  name: string;
  assignee: "proprio" | "assistant" | "proprio+assistant";
  trigger: TriggerType;
  anchor?: TriggerAnchor;
  offset?: number;
  action?: ActionType;
  note?: string;
  /// Étape adossée aux émargements : suivie par les signatures réelles.
  attendance?: boolean;
  /// Nom du template par défaut à envoyer (voir default-templates.ts).
  sendTemplate?: string;
  recipient?: "students" | "company_contact" | "trainer";
};

const ASSISTANT_NOTE = "À faire par l'assistant(e) (ex. Fatima).";
const BOTH_NOTE = "Propriétaire + assistant(e) (ex. Fatima).";

export const DEFAULT_PROCESS_NAME = "Process standard (7 phases + suivi)";

export const DEFAULT_PROCESS: DefaultStep[] = [
  // Phase 1
  { phase: 1, name: "Catalogue + Programme + Devis + RI + Questionnaire envoyés", assignee: "proprio+assistant", trigger: "manual" },
  // Phase 2
  { phase: 2, name: "Contrat ou Convention signé(e)", assignee: "proprio", trigger: "manual" },
  { phase: 2, name: "Questionnaire d'analyse des besoins reçu complété", assignee: "proprio", trigger: "manual" },
  { phase: 2, name: "Note d'entretien préalable rédigée", assignee: "proprio", trigger: "manual" },
  { phase: 2, name: "Bilan handicap démarré (si applicable)", assignee: "proprio", trigger: "manual" },
  { phase: 2, name: "Demande OPCO déposée avec subrogation cochée", assignee: "assistant", trigger: "manual" },
  { phase: 2, name: "Accord OPCO reçu + 14 jours de rétractation attendus", assignee: "assistant", trigger: "event", anchor: "opco_agreement" },
  { phase: 2, name: "Dates fixées + Moodle / Meet préparés", assignee: "proprio+assistant", trigger: "manual" },
  // Phase 3
  { phase: 3, name: "Convocation envoyée", assignee: "assistant", trigger: "time_offset", anchor: "start_date", offset: -7, action: "send_message", sendTemplate: "Convocation (J-7)", recipient: "students" },
  { phase: 3, name: "Livret + Charte + RI envoyés", assignee: "assistant", trigger: "time_offset", anchor: "start_date", offset: -7 },
  { phase: 3, name: "Identifiants + lien Meet envoyés", assignee: "proprio", trigger: "time_offset", anchor: "start_date", offset: -2, action: "send_message", sendTemplate: "Identifiants et lien de connexion (J-2)", recipient: "students" },
  { phase: 3, name: "Test de connexion 24h avant démarrage", assignee: "proprio", trigger: "time_offset", anchor: "start_date", offset: -1 },
  { phase: 3, name: "Évaluation initiale complétée", assignee: "proprio", trigger: "time_offset", anchor: "start_date", offset: 0 },
  // Phase 4
  { phase: 4, name: "Émargements matin + après-midi", assignee: "proprio", trigger: "manual", action: "request_signature", attendance: true },
  { phase: 4, name: "Exercices notés + retours individuels", assignee: "proprio", trigger: "manual" },
  { phase: 4, name: "Point d'étape fin de bloc (J3, J6, J9)", assignee: "proprio", trigger: "manual" },
  // Phase 5
  { phase: 5, name: "Attestation + Éval finale + Bilan APPRENANT envoyés", assignee: "proprio", trigger: "time_offset", anchor: "end_date", offset: 0, action: "send_message", sendTemplate: "Attestation et bilan de fin (J)", recipient: "students" },
  { phase: 5, name: "Bilan handicap clôturé (si applicable)", assignee: "proprio", trigger: "time_offset", anchor: "end_date", offset: 0 },
  { phase: 5, name: "Certificat + Bilan ENTREPRISE envoyés", assignee: "assistant", trigger: "time_offset", anchor: "end_date", offset: 0 },
  { phase: 5, name: "Certificat + Émargements + Attestation FOAD + Facture + Bilan FINANCEUR sur portail OPCO", assignee: "assistant", trigger: "time_offset", anchor: "end_date", offset: 0 },
  { phase: 5, name: "Facture entreprise envoyée (si pas de subrogation)", assignee: "assistant", trigger: "time_offset", anchor: "end_date", offset: 5 },
  // Phase 6
  { phase: 6, name: "Relance bilans 48h", assignee: "proprio+assistant", trigger: "time_offset", anchor: "end_date", offset: 2, action: "send_message", sendTemplate: "Relance bilan (J+2)", recipient: "students" },
  { phase: 6, name: "Relance bilans 72h", assignee: "proprio+assistant", trigger: "time_offset", anchor: "end_date", offset: 3 },
  { phase: 6, name: "Note « non répondant » au registre", assignee: "assistant", trigger: "time_offset", anchor: "end_date", offset: 7 },
  // Phase 7
  { phase: 7, name: "Synthèse des bilans", assignee: "proprio", trigger: "time_offset", anchor: "end_date", offset: 15 },
  { phase: 7, name: "Suivi du paiement OPCO", assignee: "assistant", trigger: "time_offset", anchor: "end_date", offset: 15 },
  { phase: 7, name: "Enquête à froid envoyée", assignee: "proprio", trigger: "time_offset", anchor: "end_date", offset: 90, action: "send_message", sendTemplate: "Enquête à froid (J+90)", recipient: "students" },
];

// Traduit une étape par défaut en données StepTemplate (sans ids), pour un
// propriétaire donné. `templateIds` relie les étapes d'envoi à leur mail.
export function toStepTemplateData(step: DefaultStep, order: number, ownerId: string, templateIds: Map<string, string> = new Map()) {
  const note = step.assignee === "assistant" ? ASSISTANT_NOTE : step.assignee === "proprio+assistant" ? BOTH_NOTE : null;
  return {
    order,
    phase: step.phase,
    name: step.name,
    description: [step.note, note].filter(Boolean).join(" ") || null,
    assigneeUserId: step.assignee === "assistant" ? null : ownerId,
    assigneeRoleId: null,
    triggerType: step.trigger,
    triggerAnchor: step.anchor ?? null,
    triggerOffsetDays: step.trigger === "time_offset" ? (step.offset ?? 0) : null,
    actionType: step.action ?? ("checklist_only" as ActionType),
    actionParams: step.attendance
      ? { kind: "attendance" }
      : step.action === "send_message" && step.sendTemplate && templateIds.has(step.sendTemplate)
        ? { templateId: templateIds.get(step.sendTemplate)!, recipient: step.recipient ?? "students" }
        : undefined,
  };
}

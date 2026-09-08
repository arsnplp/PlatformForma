import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import type { DocumentSlotKind, SignatureStatus } from "@/generated/prisma/enums";

// ═══════════════════════════════════════════════════════════════════════════
// L'ESPACE COMMUN
//
// Un emplacement (« carré ») dit ce qu'on attend. Son état n'est pas stocké :
// il se LIT à partir de la pièce qu'il contient. Un statut en base finirait
// par mentir le jour où une signature aboutit sans que personne ne repasse.
// ═══════════════════════════════════════════════════════════════════════════

export type SlotState = "empty" | "to_sign" | "signing" | "filled" | "signed";

export type SlotView = {
  id: string;
  kind: DocumentSlotKind;
  title: string;
  instructions: string | null;
  dueDate: Date | null;
  state: SlotState;
  /// Vrai quand la balle est dans le camp du titulaire (élève ou entreprise).
  waitingOnHolder: boolean;
  document: { id: string; title: string; mimeType: string | null; sizeBytes: number | null; signatureStatus: SignatureStatus } | null;
};

type SlotRow = {
  id: string;
  kind: DocumentSlotKind;
  title: string;
  instructions: string | null;
  dueDate: Date | null;
  document: { id: string; title: string; mimeType: string | null; sizeBytes: number | null; signatureStatus: SignatureStatus } | null;
};

export function readSlotState(slot: SlotRow): SlotState {
  if (!slot.document) return "empty";
  if (slot.kind === "to_provide") return "filled";
  if (slot.document.signatureStatus === "signed") return "signed";
  return slot.document.signatureStatus === "pending" ? "signing" : "to_sign";
}

export function toSlotView(slot: SlotRow): SlotView {
  const state = readSlotState(slot);
  return {
    id: slot.id,
    kind: slot.kind,
    title: slot.title,
    instructions: slot.instructions,
    dueDate: slot.dueDate,
    state,
    // Le titulaire doit agir tant qu'il n'a pas déposé, ou pas signé.
    waitingOnHolder: state === "empty" || state === "signing" || state === "to_sign",
    document: slot.document,
  };
}

const slotSelect = {
  id: true,
  kind: true,
  title: true,
  instructions: true,
  dueDate: true,
  document: { select: { id: true, title: true, mimeType: true, sizeBytes: true, signatureStatus: true } },
} as const;

// Emplacements d'un élève pour une session, dans l'ordre voulu.
export async function listStudentSlots(sessionId: string, userId: string): Promise<SlotView[]> {
  const slots = await prisma.documentSlot.findMany({
    where: { sessionId, userId, archivedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: slotSelect,
  });
  return slots.map(toSlotView);
}

export async function listCompanySlots(companyId: string): Promise<SlotView[]> {
  const slots = await prisma.documentSlot.findMany({
    where: { companyId, archivedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: slotSelect,
  });
  return slots.map(toSlotView);
}

// Combien d'emplacements attendent un geste du titulaire : c'est le chiffre de
// la pastille, côté élève comme côté entreprise.
export async function countWaitingSlots(where: { sessionId: string; userId: string } | { companyId: string }): Promise<number> {
  const slots = await prisma.documentSlot.findMany({
    where: { ...where, archivedAt: null },
    select: slotSelect,
  });
  return slots.filter((s) => toSlotView(s).waitingOnHolder).length;
}

export type SlotAccess = { allowed: false } | { allowed: true; role: "holder" | "staff" };

// Qui touche à un emplacement : son titulaire, ou l'encadrement du dossier.
export async function checkSlotAccess(slotId: string, me: CurrentUser): Promise<SlotAccess> {
  const slot = await prisma.documentSlot.findUnique({
    where: { id: slotId },
    select: {
      userId: true,
      companyId: true,
      session: { select: { ownerId: true, trainerId: true } },
      company: { select: { ownerId: true } },
    },
  });
  if (!slot) return { allowed: false };

  if (slot.userId && slot.userId === me.id) return { allowed: true, role: "holder" };
  // Titulaire entreprise : les comptes rattachés à cette entreprise.
  if (slot.companyId) {
    const membership = await prisma.user.findUnique({ where: { id: me.id }, select: { companyId: true } });
    if (membership?.companyId === slot.companyId) return { allowed: true, role: "holder" };
  }

  if (canSupervise(me)) return { allowed: true, role: "staff" };
  if (slot.session && (slot.session.ownerId === me.id || slot.session.trainerId === me.id)) {
    return { allowed: true, role: "staff" };
  }
  if (slot.company && slot.company.ownerId === me.id) return { allowed: true, role: "staff" };
  return { allowed: false };
}

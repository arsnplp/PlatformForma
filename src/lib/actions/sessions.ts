"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { parseForm, type FormState } from "./shared";

const quickSessionSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire"),
    startDate: z.coerce.date({ message: "Date de début invalide" }),
    endDate: z.coerce.date({ message: "Date de fin invalide" }),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "La fin doit être après le début", path: ["endDate"] });

// Création minimale (sous-étape b) : la session est rattachée à la VERSION ACTIVE
// de la formation au moment de sa création, et n'en changera jamais (piège n°3).
// Le CRUD complet (entreprise, formateur, inscriptions…) arrive en (c).
export async function createQuickSession(formationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_sessions");
  const formation = await prisma.formation.findUnique({ where: { id: formationId } });
  if (!formation) throw new Error("Formation introuvable");
  assertOwnerOrSupervisor(me, formation.ownerId);
  if (formation.archivedAt) return { error: "Formation archivée : impossible de créer une session." };

  const parsed = parseForm(quickSessionSchema, formData);
  if (!parsed.ok) return parsed.state;

  const active = await prisma.formationVersion.findFirst({ where: { formationId, status: "active" } });
  if (!active) return { error: "Aucune version active : publie d'abord une version." };

  await prisma.session.create({
    data: {
      ownerId: formation.ownerId,
      formationVersionId: active.id,
      name: parsed.data.name,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    },
  });
  revalidatePath(`/admin/formations/${formationId}`);
  return undefined;
}

"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { TriggerType, TriggerAnchor, ActionType } from "@/generated/prisma/enums";
import { PHASE_NUMBERS, ACTION_TYPE } from "@/lib/labels";
import { DEFAULT_PROCESS, DEFAULT_PROCESS_NAME, toStepTemplateData } from "@/lib/process/default-process";
import { parseForm, emptyToNull, type FormState } from "./shared";
import { z as zod } from "zod";

// ── Garde-fous ─────────────────────────────────────────────────────────────
// Le process d'une version est du MODÈLE : éditable uniquement sur un brouillon,
// gelé dès publication. Les sessions figent leur propre copie (snapshot, étape b).

async function loadDraftVersion(versionId: string, me: CurrentUser) {
  const version = await prisma.formationVersion.findUnique({ where: { id: versionId }, include: { formation: true } });
  if (!version) throw new Error("Version introuvable");
  assertOwnerOrSupervisor(me, version.formation.ownerId);
  if (version.formation.archivedAt) throw new Error("Formation archivée");
  if (version.status !== "draft") throw new Error("Version publiée : son process est gelé");
  return version;
}

async function loadDraftStep(stepId: string, me: CurrentUser) {
  const step = await prisma.stepTemplate.findUnique({ where: { id: stepId }, include: { processTemplate: true } });
  if (!step) throw new Error("Étape introuvable");
  const version = await loadDraftVersion(step.processTemplate.formationVersionId, me);
  return { step, version };
}

function revalidate(formationId: string) {
  revalidatePath(`/admin/formations/${formationId}`);
}

// Crée (si absent) le ProcessTemplate d'une version. Appelé par les écrans.
export async function ensureProcessTemplate(versionId: string, name = DEFAULT_PROCESS_NAME) {
  const existing = await prisma.processTemplate.findFirst({ where: { formationVersionId: versionId, archivedAt: null } });
  if (existing) return existing;
  return prisma.processTemplate.create({ data: { formationVersionId: versionId, name } });
}

// Remplit une version (brouillon) avec le process par défaut. Utilisé à la
// création d'une formation et via le bouton « Appliquer le process standard ».
export async function seedDefaultProcess(versionId: string, ownerId: string) {
  const template = await ensureProcessTemplate(versionId);
  const last = await prisma.stepTemplate.findFirst({ where: { processTemplateId: template.id }, orderBy: { order: "desc" } });
  let order = last?.order ?? 0;
  await prisma.stepTemplate.createMany({
    data: DEFAULT_PROCESS.map((s) => ({ processTemplateId: template.id, ...toStepTemplateData(s, ++order, ownerId) })),
  });
  return template;
}

export async function applyDefaultProcess(versionId: string) {
  const me = await requirePermission("can_edit_process_template");
  const version = await loadDraftVersion(versionId, me);
  await seedDefaultProcess(versionId, version.formation.ownerId);
  revalidate(version.formationId);
}

// ── Étapes ─────────────────────────────────────────────────────────────────

const stepSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire"),
    description: z.preprocess(emptyToNull, z.string().trim().nullable()),
    phase: z.coerce.number().int().refine((n) => PHASE_NUMBERS.includes(n), "Phase invalide"),
    assigneeUserId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    assigneeRoleId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
    triggerType: z.nativeEnum(TriggerType),
    triggerAnchor: z.preprocess(emptyToNull, z.nativeEnum(TriggerAnchor).nullable()),
    triggerOffsetDays: z.preprocess(emptyToNull, z.coerce.number().int().min(-365).max(365).nullable()),
    actionType: z.nativeEnum(ActionType),
  })
  .refine((d) => !(d.assigneeUserId && d.assigneeRoleId), { message: "Un utilisateur OU un rôle, pas les deux", path: ["assigneeRoleId"] })
  .refine((d) => d.triggerType === "manual" || d.triggerAnchor, { message: "Choisis une ancre", path: ["triggerAnchor"] })
  .refine((d) => !ACTION_TYPE[d.actionType].availableFrom, { message: "Cette action arrive à un palier ultérieur", path: ["actionType"] });

function normalize(d: z.infer<typeof stepSchema>) {
  return {
    ...d,
    triggerAnchor: d.triggerType === "manual" ? null : d.triggerAnchor,
    triggerOffsetDays: d.triggerType === "time_offset" ? (d.triggerOffsetDays ?? 0) : null,
  };
}

export async function createStep(versionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_process_template");
  const version = await loadDraftVersion(versionId, me);
  const parsed = parseForm(stepSchema, formData);
  if (!parsed.ok) return parsed.state;

  const template = await ensureProcessTemplate(versionId);
  // Insérée en fin de sa phase : ordre = dernière étape de phase ≤ celle-ci, les suivantes décalées.
  const steps = await prisma.stepTemplate.findMany({ where: { processTemplateId: template.id }, orderBy: { order: "asc" } });
  const after = steps.filter((s) => s.phase <= parsed.data.phase);
  const insertAt = after.length ? after[after.length - 1].order + 1 : 1;
  await prisma.$transaction(async (tx) => {
    // Décale par le haut pour respecter l'unicité (processTemplateId, order).
    const toShift = steps.filter((s) => s.order >= insertAt).sort((a, b) => b.order - a.order);
    for (const s of toShift) await tx.stepTemplate.update({ where: { id: s.id }, data: { order: s.order + 1 } });
    await tx.stepTemplate.create({ data: { processTemplateId: template.id, order: insertAt, ...normalize(parsed.data) } });
  });
  revalidate(version.formationId);
  redirect(`/admin/formations/${version.formationId}?v=${version.versionNumber}&tab=process`);
}

export async function updateStep(stepId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_process_template");
  const { step, version } = await loadDraftStep(stepId, me);
  const parsed = parseForm(stepSchema, formData);
  if (!parsed.ok) return parsed.state;

  await prisma.stepTemplate.update({ where: { id: step.id }, data: normalize(parsed.data) });
  // Si la phase change, on replace l'étape en fin de sa nouvelle phase.
  if (parsed.data.phase !== step.phase) await resequence(step.processTemplateId);
  revalidate(version.formationId);
  redirect(`/admin/formations/${version.formationId}?v=${version.versionNumber}&tab=process`);
}

// Brouillon = modèle en construction, jamais vécu : suppression physique acceptable.
export async function removeStep(stepId: string) {
  const me = await requirePermission("can_edit_process_template");
  const { step, version } = await loadDraftStep(stepId, me);
  await prisma.stepTemplate.delete({ where: { id: step.id } });
  await resequence(step.processTemplateId);
  revalidate(version.formationId);
}

// Monte / descend d'un cran à l'intérieur de sa phase.
export async function moveStep(stepId: string, direction: "up" | "down") {
  const me = await requirePermission("can_edit_process_template");
  const { step, version } = await loadDraftStep(stepId, me);
  const siblings = await prisma.stepTemplate.findMany({
    where: { processTemplateId: step.processTemplateId, phase: step.phase },
    orderBy: { order: "asc" },
  });
  const i = siblings.findIndex((s) => s.id === step.id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  const a = siblings[i], b = siblings[j];
  await prisma.$transaction([
    prisma.stepTemplate.update({ where: { id: a.id }, data: { order: -1 } }),
    prisma.stepTemplate.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.stepTemplate.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);
  revalidate(version.formationId);
}

// ── Bibliothèque : copier le process d'une autre version (spec §6.4) ────────
// « Remplacer » vide d'abord le brouillon (jamais du vécu), « Ajouter » complète.
// L'assigné suit la logique du process standard : une étape assignée au
// propriétaire de la formation SOURCE est réassignée au propriétaire de la
// formation CIBLE ; un rôle est conservé ; tout autre utilisateur est conservé.

const copySchema = zod.object({
  sourceVersionId: zod.string().uuid("Choisis un process à copier"),
  mode: zod.enum(["replace", "append"]).default("append"),
});

export async function copyProcessFrom(targetVersionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_process_template");
  const target = await loadDraftVersion(targetVersionId, me);
  const parsed = parseForm(copySchema, formData);
  if (!parsed.ok) return parsed.state;
  if (parsed.data.sourceVersionId === targetVersionId) return { error: "Source et cible identiques." };

  const source = await prisma.formationVersion.findUnique({
    where: { id: parsed.data.sourceVersionId },
    include: { formation: true, processTemplates: { where: { archivedAt: null }, take: 1, include: { steps: { orderBy: [{ phase: "asc" }, { order: "asc" }] } } } },
  });
  if (!source) return { error: "Process source introuvable." };
  assertOwnerOrSupervisor(me, source.formation.ownerId);
  const sourceSteps = source.processTemplates[0]?.steps ?? [];
  if (sourceSteps.length === 0) return { error: "Ce process ne contient aucune étape." };

  const sourceOwnerId = source.formation.ownerId;
  const targetOwnerId = target.formation.ownerId;

  await prisma.$transaction(async (tx) => {
    const template = await tx.processTemplate.findFirst({ where: { formationVersionId: targetVersionId, archivedAt: null } })
      ?? await tx.processTemplate.create({ data: { formationVersionId: targetVersionId, name: source.processTemplates[0]?.name ?? DEFAULT_PROCESS_NAME } });

    if (parsed.data.mode === "replace") {
      await tx.stepTemplate.deleteMany({ where: { processTemplateId: template.id } });
    }
    const last = await tx.stepTemplate.findFirst({ where: { processTemplateId: template.id }, orderBy: { order: "desc" } });
    let order = last?.order ?? 0;
    await tx.stepTemplate.createMany({
      data: sourceSteps.map((s) => ({
        processTemplateId: template.id,
        order: ++order,
        phase: s.phase,
        name: s.name,
        description: s.description,
        assigneeUserId: s.assigneeUserId === sourceOwnerId ? targetOwnerId : s.assigneeUserId,
        assigneeRoleId: s.assigneeRoleId,
        triggerType: s.triggerType,
        triggerAnchor: s.triggerAnchor,
        triggerOffsetDays: s.triggerOffsetDays,
        actionType: s.actionType,
        actionParams: s.actionParams ?? undefined,
      })),
    });
  });
  // Remet l'ordre global cohérent (phase croissante) après un ajout.
  const template = await prisma.processTemplate.findFirstOrThrow({ where: { formationVersionId: targetVersionId, archivedAt: null } });
  await resequence(template.id);

  revalidate(target.formationId);
  redirect(`/admin/formations/${target.formationId}?v=${target.versionNumber}&tab=process`);
}

// Renumérote 1..n dans l'ordre (phase, ordre courant) — après suppression ou changement de phase.
async function resequence(processTemplateId: string) {
  const steps = await prisma.stepTemplate.findMany({ where: { processTemplateId }, orderBy: [{ phase: "asc" }, { order: "asc" }] });
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < steps.length; i++) await tx.stepTemplate.update({ where: { id: steps[i].id }, data: { order: -(i + 1) } });
    for (let i = 0; i < steps.length; i++) await tx.stepTemplate.update({ where: { id: steps[i].id }, data: { order: i + 1 } });
  });
}

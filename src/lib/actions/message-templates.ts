"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { DEFAULT_TEMPLATES } from "@/lib/messages/default-templates";
import { inspectVariables } from "@/lib/messages/variables";
import { parseForm, type FormState } from "./shared";

// Comme le process : les templates sont du MODÈLE, éditables sur un brouillon
// et gelés à la publication. Une session enverra le texte figé de sa version.

async function loadDraftVersion(versionId: string, me: CurrentUser) {
  const version = await prisma.formationVersion.findUnique({ where: { id: versionId }, include: { formation: true } });
  if (!version) throw new Error("Version introuvable");
  assertOwnerOrSupervisor(me, version.formation.ownerId);
  if (version.formation.archivedAt) throw new Error("Formation archivée");
  if (version.status !== "draft") throw new Error("Version publiée : ses templates sont gelés");
  return version;
}

async function loadDraftTemplate(templateId: string, me: CurrentUser) {
  const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error("Template introuvable");
  const version = await loadDraftVersion(template.formationVersionId, me);
  return { template, version };
}

const templateSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire"),
  subject: z.string().trim().min(1, "L'objet est obligatoire"),
  body: z.string().trim().min(1, "Le corps est obligatoire"),
});

// Refuse une variable qui n'existe pas : sinon le mail partirait avec {{truc}}.
function checkVariables(data: z.infer<typeof templateSchema>): FormState {
  for (const [field, text] of [["subject", data.subject], ["body", data.body]] as const) {
    const { unknown } = inspectVariables(text);
    if (unknown.length > 0) {
      return {
        error: "Vérifie les champs en erreur.",
        fieldErrors: { [field]: [`Variable${unknown.length > 1 ? "s" : ""} inconnue${unknown.length > 1 ? "s" : ""} : ${unknown.map((k) => `{{${k}}}`).join(", ")}`] },
        values: { ...data },
      };
    }
  }
  return undefined;
}

function revalidate(formationId: string) {
  revalidatePath(`/admin/formations/${formationId}`);
}

export async function createMessageTemplate(versionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_process_template");
  const version = await loadDraftVersion(versionId, me);
  const parsed = parseForm(templateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const invalid = checkVariables(parsed.data);
  if (invalid) return invalid;

  await prisma.messageTemplate.create({ data: { formationVersionId: versionId, ...parsed.data } });
  revalidate(version.formationId);
  redirect(`/admin/formations/${version.formationId}?v=${version.versionNumber}&tab=mails`);
}

export async function updateMessageTemplate(templateId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_process_template");
  const { template, version } = await loadDraftTemplate(templateId, me);
  const parsed = parseForm(templateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const invalid = checkVariables(parsed.data);
  if (invalid) return invalid;

  await prisma.messageTemplate.update({ where: { id: template.id }, data: parsed.data });
  revalidate(version.formationId);
  redirect(`/admin/formations/${version.formationId}?v=${version.versionNumber}&tab=mails`);
}

// Brouillon = modèle en construction, jamais vécu : suppression physique acceptable.
export async function removeMessageTemplate(templateId: string) {
  const me = await requirePermission("can_edit_process_template");
  const { template, version } = await loadDraftTemplate(templateId, me);
  await prisma.messageTemplate.delete({ where: { id: template.id } });
  revalidate(version.formationId);
}

// Ajoute les 5 mails par défaut (ignore ceux dont le nom existe déjà).
export async function applyDefaultTemplates(versionId: string) {
  const me = await requirePermission("can_edit_process_template");
  const version = await loadDraftVersion(versionId, me);
  const existing = await prisma.messageTemplate.findMany({ where: { formationVersionId: versionId }, select: { name: true } });
  const names = new Set(existing.map((t) => t.name));
  const toCreate = DEFAULT_TEMPLATES.filter((t) => !names.has(t.name));
  if (toCreate.length > 0) {
    await prisma.messageTemplate.createMany({ data: toCreate.map((t) => ({ formationVersionId: versionId, ...t })) });
  }
  revalidate(version.formationId);
}

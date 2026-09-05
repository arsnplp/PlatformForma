"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { copyVersionContent } from "@/lib/formations/copy";
import { parseForm, emptyToNull, type FormState } from "./shared";

const formationSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire"),
  sector: z.preprocess(emptyToNull, z.string().trim().nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().nullable()),
});

function revalidate(id?: string) {
  revalidatePath("/admin/formations");
  if (id) revalidatePath(`/admin/formations/${id}`);
}

async function loadOwned(id: string, me: CurrentUser) {
  const formation = await prisma.formation.findUnique({ where: { id } });
  if (!formation) throw new Error("Formation introuvable");
  assertOwnerOrSupervisor(me, formation.ownerId);
  return formation;
}

async function loadOwnedVersion(versionId: string, me: CurrentUser) {
  const version = await prisma.formationVersion.findUnique({
    where: { id: versionId },
    include: { formation: true },
  });
  if (!version) throw new Error("Version introuvable");
  assertOwnerOrSupervisor(me, version.formation.ownerId);
  if (version.formation.archivedAt) throw new Error("Formation archivée");
  return version;
}

// ── Identité (non versionnée : nom, secteur, description) ───────────────────

export async function createFormation(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_formation");
  const parsed = parseForm(formationSchema, formData);
  if (!parsed.ok) return parsed.state;

  // Une formation naît avec une v1 en brouillon (spec §8.3 : mode brouillon).
  const formation = await prisma.formation.create({
    data: {
      ...parsed.data,
      ownerId: me.id,
      versions: { create: { versionNumber: 1, status: "draft", createdById: me.id, changelog: "Version initiale" } },
    },
  });
  revalidate();
  redirect(`/admin/formations/${formation.id}`);
}

export async function updateFormation(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_formation");
  await loadOwned(id, me);
  const parsed = parseForm(formationSchema, formData);
  if (!parsed.ok) return parsed.state;

  await prisma.formation.update({ where: { id }, data: parsed.data });
  revalidate(id);
  redirect(`/admin/formations/${id}`);
}

// Soft-delete : les sessions, dossiers et documents qui pointent vers elle restent intacts.
export async function archiveFormation(id: string) {
  const me = await requirePermission("can_edit_formation");
  await loadOwned(id, me);
  await prisma.formation.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidate(id);
  redirect("/admin/formations");
}

export async function restoreFormation(id: string) {
  const me = await requirePermission("can_edit_formation");
  await loadOwned(id, me);
  await prisma.formation.update({ where: { id }, data: { archivedAt: null } });
  revalidate(id);
}

// ── Duplication : nouvelle formation indépendante, v1 brouillon, contenu copié ──

export async function duplicateFormation(id: string) {
  const me = await requirePermission("can_edit_formation");
  const source = await loadOwned(id, me);
  // Version active de préférence, sinon la plus récente.
  const sourceVersion =
    (await prisma.formationVersion.findFirst({ where: { formationId: id, status: "active" } })) ??
    (await prisma.formationVersion.findFirst({ where: { formationId: id }, orderBy: { versionNumber: "desc" } }));
  if (!sourceVersion) throw new Error("Aucune version à dupliquer");

  const copy = await prisma.$transaction(async (tx) => {
    const formation = await tx.formation.create({
      data: {
        name: `${source.name} (copie)`,
        sector: source.sector,
        description: source.description,
        ownerId: me.id,
      },
    });
    const version = await tx.formationVersion.create({
      data: {
        formationId: formation.id,
        versionNumber: 1,
        status: "draft",
        createdById: me.id,
        changelog: `Dupliquée depuis « ${source.name} » v${sourceVersion.versionNumber}`,
      },
    });
    await copyVersionContent(tx, sourceVersion.id, version.id);
    return formation;
  });

  revalidate();
  redirect(`/admin/formations/${copy.id}`);
}

// ── Versions ────────────────────────────────────────────────────────────────

const versionSchema = z.object({
  changelog: z.string().trim().min(1, "Décris ce qui change dans cette version"),
});

// Nouvelle version brouillon = copie de la version la plus récente + changelog.
// Les versions précédentes et leurs sessions ne sont jamais touchées.
export async function createDraftVersion(formationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_edit_formation");
  const formation = await loadOwned(formationId, me);
  if (formation.archivedAt) return { error: "Formation archivée : restaure-la d'abord." };
  const parsed = parseForm(versionSchema, formData);
  if (!parsed.ok) return parsed.state;

  const latest = await prisma.formationVersion.findFirst({
    where: { formationId },
    orderBy: { versionNumber: "desc" },
  });
  if (!latest) throw new Error("Aucune version");
  if (latest.status === "draft") return { error: `La v${latest.versionNumber} est encore en brouillon : publie-la ou continue de la modifier.` };

  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.formationVersion.create({
      data: {
        formationId,
        versionNumber: latest.versionNumber + 1,
        status: "draft",
        createdById: me.id,
        changelog: parsed.data.changelog,
      },
    });
    await copyVersionContent(tx, latest.id, version.id);
    return version;
  });

  revalidate(formationId);
  redirect(`/admin/formations/${formationId}?v=${created.versionNumber}`);
}

// Publier : le brouillon devient actif, l'ancienne version active passe en « remplacée ».
// Son contenu reste gelé et consultable ; ses sessions continuent de pointer dessus.
export async function publishVersion(versionId: string) {
  const me = await requirePermission("can_edit_formation");
  const version = await loadOwnedVersion(versionId, me);
  if (version.status !== "draft") throw new Error("Seul un brouillon peut être publié");

  await prisma.$transaction([
    prisma.formationVersion.updateMany({
      where: { formationId: version.formationId, status: "active" },
      data: { status: "archived" },
    }),
    prisma.formationVersion.update({
      where: { id: versionId },
      data: { status: "active", publishedAt: new Date() },
    }),
  ]);
  revalidate(version.formationId);
}

// ── Contenu minimal d'un brouillon (modules / leçons) ───────────────────────
// Éditable uniquement tant que la version est en brouillon : une version
// publiée est gelée (principe directeur). L'éditeur complet vient au palier 4.

async function loadDraftVersion(versionId: string, me: CurrentUser) {
  const version = await loadOwnedVersion(versionId, me);
  if (version.status !== "draft") throw new Error("Version publiée : son contenu est gelé");
  return version;
}

export async function addModule(versionId: string, formData: FormData) {
  const me = await requirePermission("can_edit_formation");
  const version = await loadDraftVersion(versionId, me);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const last = await prisma.module.findFirst({ where: { formationVersionId: versionId }, orderBy: { order: "desc" } });
  await prisma.module.create({ data: { formationVersionId: versionId, order: (last?.order ?? 0) + 1, title } });
  revalidate(version.formationId);
}

export async function removeModule(moduleId: string) {
  const me = await requirePermission("can_edit_formation");
  const mod = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!mod) throw new Error("Module introuvable");
  const version = await loadDraftVersion(mod.formationVersionId, me);
  // Brouillon = modèle en construction, jamais vécu : suppression physique acceptable.
  await prisma.$transaction(async (tx) => {
    const lessons = await tx.lesson.findMany({ where: { moduleId }, select: { id: true } });
    const lessonIds = lessons.map((l) => l.id);
    await tx.contentBlock.deleteMany({ where: { lessonId: { in: lessonIds } } });
    await tx.exercise.deleteMany({ where: { OR: [{ moduleId }, { lessonId: { in: lessonIds } }] } });
    await tx.lesson.deleteMany({ where: { moduleId } });
    await tx.module.delete({ where: { id: moduleId } });
  });
  revalidate(version.formationId);
}

export async function addLesson(moduleId: string, formData: FormData) {
  const me = await requirePermission("can_edit_formation");
  const mod = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!mod) throw new Error("Module introuvable");
  const version = await loadDraftVersion(mod.formationVersionId, me);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const last = await prisma.lesson.findFirst({ where: { moduleId }, orderBy: { order: "desc" } });
  await prisma.lesson.create({ data: { moduleId, order: (last?.order ?? 0) + 1, title } });
  revalidate(version.formationId);
}

export async function removeLesson(lessonId: string) {
  const me = await requirePermission("can_edit_formation");
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson) throw new Error("Leçon introuvable");
  const version = await loadDraftVersion(lesson.module.formationVersionId, me);
  await prisma.$transaction(async (tx) => {
    await tx.contentBlock.deleteMany({ where: { lessonId } });
    await tx.exercise.deleteMany({ where: { lessonId } });
    await tx.lesson.delete({ where: { id: lessonId } });
  });
  revalidate(version.formationId);
}

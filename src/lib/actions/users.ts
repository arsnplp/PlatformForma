"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise, assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseForm, fieldError, emptyToNull, type FormState } from "./shared";

export type AccountState =
  | (NonNullable<FormState> & { created?: { email: string; invited: boolean; sentTo?: string; sandbox?: boolean; error?: string } })
  | undefined;

// Mot de passe posé à la main : c'est le formateur qui le transmet, par le
// canal qu'il choisit. Huit caractères au minimum, comme l'exige Supabase.
const passwordField = z.string().min(8, "Huit caractères au minimum").max(72, "Mot de passe trop long");

// Message volontairement neutre : ne révèle pas si l'adresse existe déjà.
const NEUTRAL = "Création impossible avec cet email. S'il est déjà utilisé sur la plateforme, cherche le compte existant.";

// Crée le compte d'authentification et le profil, sans jamais transmettre de
// mot de passe : la personne pose le sien depuis le lien d'invitation.
async function createAccount(params: {
  name: string;
  email: string;
  roleKey: string;
  companyId?: string | null;
  /// Mot de passe posé par le formateur. Sans lui, on tire un secret que
  /// personne ne connaît : le compte n'est alors utilisable qu'après un lien
  /// d'activation.
  password?: string;
  actor: CurrentUser;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) return { ok: false, error: NEUTRAL };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password ?? randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { name: params.name },
  });
  if (error) return { ok: false, error: NEUTRAL };

  const role = await prisma.role.findUniqueOrThrow({ where: { key: params.roleKey } });
  await prisma.$transaction([
    prisma.user.upsert({
      where: { id: data.user.id },
      create: { id: data.user.id, email: params.email, name: params.name, companyId: params.companyId ?? null },
      update: { name: params.name, companyId: params.companyId ?? null },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: data.user.id, roleId: role.id } },
      create: { userId: data.user.id, roleId: role.id },
      update: {},
    }),
  ]);
  return { ok: true, userId: data.user.id };
}

// ── Formateur ──────────────────────────────────────────────────────────────

const trainerSchema = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: passwordField,
});

// Créer un compte de formateur : réservé à qui gère les utilisateurs.
export async function createTrainer(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requirePermission("can_manage_users");
  const parsed = parseForm(trainerSchema, formData);
  if (!parsed.ok) return parsed.state;

  const created = await createAccount({ ...parsed.data, roleKey: "formateur", actor: me });
  if (!created.ok) return fieldError(formData, "email", created.error);

  revalidatePath("/admin/utilisateurs");
  // Aucun mail : le compte est utilisable tout de suite, et c'est le créateur
  // qui transmet les identifiants par le canal de son choix.
  return { created: { email: parsed.data.email, invited: false } };
}

// ── Élève ──────────────────────────────────────────────────────────────────

// Une entreprise absente de la liste se crée ici, avec les MÊMES champs que
// sa fiche : une entreprise n'est pas qu'un nom, et une fiche créée à moitié
// devrait être complétée plus tard — donc jamais.
const newCompanySchema = z.object({
  name: z.string().trim().min(1, "Nom de l'entreprise requis"),
  siret: z.preprocess(emptyToNull, z.string().regex(/^\d{14}$/, "Le SIRET comporte 14 chiffres").nullable()),
  sector: z.preprocess(emptyToNull, z.string().trim().nullable()),
  contactName: z.preprocess(emptyToNull, z.string().trim().nullable()),
  contactEmail: z.preprocess(emptyToNull, z.string().trim().email("Email de contact invalide").nullable()),
  contactPhone: z.preprocess(emptyToNull, z.string().trim().nullable()),
  address: z.preprocess(emptyToNull, z.string().trim().nullable()),
});

const studentSchema = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: passwordField,
  companyId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  /// « existante », « nouvelle » ou vide (à titre personnel).
  companyMode: z.preprocess(emptyToNull, z.string().nullable()),
});

// Créer un élève depuis la liste des élèves, sans passer par une session.
// Son inscription à une session vient ensuite, depuis la fiche de session.
const contactSchema = z.object({
  name: z.string().trim().min(1, "Nom du contact requis").max(120),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: passwordField,
});

export async function createStudent(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = parseForm(studentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { name, email, password, companyId, companyMode } = parsed.data;

  let company = companyId;
  if (companyMode === "nouvelle") {
    const parsedCompany = parseForm(newCompanySchema, formData, "company_");
    if (!parsedCompany.ok) return parsedCompany.state;

    if (parsedCompany.data.siret) {
      const existing = await prisma.company.findUnique({ where: { siret: parsedCompany.data.siret } });
      if (existing) return fieldError(formData, "company_siret", "Ce SIRET existe déjà");
    }
    const created = await prisma.company.create({ data: { ...parsedCompany.data, ownerId: me.id } });
    company = created.id;
  } else if (company) {
    // Une entreprise hors de mon périmètre n'existe pas pour moi.
    const found = await prisma.company.findUnique({ where: { id: company }, select: { ownerId: true } });
    if (!found || (!canSupervise(me) && found.ownerId !== me.id)) {
      return fieldError(formData, "companyId", "Entreprise introuvable");
    }
  }

  const created = await createAccount({ name, email, password, roleKey: "eleve", companyId: company, actor: me });
  if (!created.ok) return fieldError(formData, "email", created.error);

  revalidatePath("/admin/eleves");
  return { created: { email, invited: false } };
}

// Rattacher (ou détacher) un élève d'une entreprise, depuis son dossier.
export async function setStudentCompany(userId: string, formData: FormData) {
  const me = await requirePermission("can_manage_sessions");
  const raw = String(formData.get("companyId") ?? "").trim();
  const companyId = raw || null;

  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { ownerId: true } });
    if (!company || (!canSupervise(me) && company.ownerId !== me.id)) throw new Error("Entreprise introuvable");
  }
  await prisma.user.update({ where: { id: userId }, data: { companyId } });
  revalidatePath(`/admin/eleves/${userId}`);
}

// Ouvre l'accès du contact d'une entreprise. Son compte n'a aucune permission :
// son périmètre tient dans son rattachement à l'entreprise, jamais dans un droit.
export async function inviteCompanyContact(companyId: string, _prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requirePermission("can_manage_companies");
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, ownerId: true, contactName: true, contactEmail: true, archivedAt: true },
  });
  if (!company) return fieldError(formData, "email", "Entreprise introuvable");
  assertOwnerOrSupervisor(me, company.ownerId);
  if (company.archivedAt) return fieldError(formData, "email", "Entreprise archivée");

  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { name, email, password } = parsed.data;

  const created = await createAccount({ name, email, password, roleKey: "entreprise", companyId: company.id, actor: me });
  if (!created.ok) return fieldError(formData, "email", created.error);

  // La fiche garde le contact à jour : c'est lui qu'on sollicitera pour signer.
  await prisma.company.update({ where: { id: company.id }, data: { contactName: name, contactEmail: email } });

  revalidatePath(`/admin/entreprises/${company.id}`);
  return { created: { email, invited: false } };
}

// Redéfinir le mot de passe d'un compte. Sans lui, quelqu'un qui oublie le
// sien resterait bloqué : plus aucun mail d'activation ne part de la
// plateforme, c'est le formateur qui rouvre l'accès et le transmet.
export async function setUserPassword(userId: string, _prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = parseForm(z.object({ password: passwordField }), formData);
  if (!parsed.ok) return parsed.state;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, archivedAt: true },
  });
  if (!target || target.archivedAt) return fieldError(formData, "password", "Compte introuvable");

  // On ne touche qu'aux comptes de son périmètre : ses élèves, les contacts de
  // ses entreprises. Les comptes du personnel demandent can_manage_users.
  if (!(await isInMyScope(target.id, me))) return fieldError(formData, "password", "Compte introuvable");

  const admin = createAdminClient();
  // User.id EST l'identifiant Supabase Auth (spec §5.1) : pas de table de
  // correspondance à consulter.
  const { error } = await admin.auth.admin.updateUserById(target.id, { password: parsed.data.password });
  if (error) return fieldError(formData, "password", "Changement impossible.");

  await prisma.accessLog.create({
    data: { userId: me.id, action: "set_password", targetType: "user", targetId: target.id },
  });
  revalidatePath(`/admin/eleves/${target.id}`);
  return { created: { email: target.email, invited: false } };
}

// Périmètre : un élève inscrit à l'une de mes sessions, ou le contact d'une de
// mes entreprises. Un superviseur, ou qui gère les utilisateurs, voit tout.
async function isInMyScope(userId: string, me: CurrentUser): Promise<boolean> {
  if (canSupervise(me) || me.permissions.has("can_manage_users")) return true;
  const enrolled = await prisma.enrollment.count({
    where: { userId, session: { OR: [{ ownerId: me.id }, { trainerId: me.id }] } },
  });
  if (enrolled > 0) return true;
  const contact = await prisma.user.count({
    where: { id: userId, company: { ownerId: me.id } },
  });
  return contact > 0;
}

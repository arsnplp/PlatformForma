"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvitation } from "@/lib/auth/invitation";
import { parseForm, fieldError, emptyToNull, type FormState } from "./shared";

export type AccountState =
  | (NonNullable<FormState> & { created?: { email: string; invited: boolean; sentTo?: string; sandbox?: boolean; error?: string } })
  | undefined;

// Message volontairement neutre : ne révèle pas si l'adresse existe déjà.
const NEUTRAL = "Création impossible avec cet email. S'il est déjà utilisé sur la plateforme, cherche le compte existant.";

// Crée le compte d'authentification et le profil, sans jamais transmettre de
// mot de passe : la personne pose le sien depuis le lien d'invitation.
async function createAccount(params: {
  name: string;
  email: string;
  roleKey: string;
  companyId?: string | null;
  actor: CurrentUser;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) return { ok: false, error: NEUTRAL };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    password: randomBytes(24).toString("base64url"),
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
});

// Créer un compte de formateur : réservé à qui gère les utilisateurs.
export async function createTrainer(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requirePermission("can_manage_users");
  const parsed = parseForm(trainerSchema, formData);
  if (!parsed.ok) return parsed.state;

  const created = await createAccount({ ...parsed.data, roleKey: "formateur", actor: me });
  if (!created.ok) return fieldError(formData, "email", created.error);

  const invitation = await sendInvitation({
    student: { id: created.userId, name: parsed.data.name, email: parsed.data.email },
    trainer: { name: me.name, email: me.email },
    actorId: me.id,
  });

  revalidatePath("/admin/utilisateurs");
  return {
    created: invitation.ok
      ? { email: parsed.data.email, invited: true, sentTo: invitation.sentTo, sandbox: invitation.sandbox }
      : { email: parsed.data.email, invited: false, error: invitation.error },
  };
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
  companyId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  /// « existante », « nouvelle » ou vide (à titre personnel).
  companyMode: z.preprocess(emptyToNull, z.string().nullable()),
});

// Créer un élève depuis la liste des élèves, sans passer par une session.
// Son inscription à une session vient ensuite, depuis la fiche de session.
export async function createStudent(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = parseForm(studentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { name, email, companyId, companyMode } = parsed.data;

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

  const created = await createAccount({ name, email, roleKey: "eleve", companyId: company, actor: me });
  if (!created.ok) return fieldError(formData, "email", created.error);

  const invitation = await sendInvitation({
    student: { id: created.userId, name, email },
    trainer: { name: me.name, email: me.email },
    actorId: me.id,
  });

  revalidatePath("/admin/eleves");
  return {
    created: invitation.ok
      ? { email, invited: true, sentTo: invitation.sentTo, sandbox: invitation.sandbox }
      : { email, invited: false, error: invitation.error },
  };
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

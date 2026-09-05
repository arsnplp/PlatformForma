"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { parseForm, fieldError, emptyToNull, type FormState } from "./shared";

const companySchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire"),
  siret: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{14}$/, "Le SIRET comporte 14 chiffres").nullable(),
  ),
  sector: z.preprocess(emptyToNull, z.string().trim().nullable()),
  contactName: z.preprocess(emptyToNull, z.string().trim().nullable()),
  contactEmail: z.preprocess(emptyToNull, z.string().trim().email("Email invalide").nullable()),
  contactPhone: z.preprocess(emptyToNull, z.string().trim().nullable()),
  address: z.preprocess(emptyToNull, z.string().trim().nullable()),
});

function revalidate(id?: string) {
  revalidatePath("/admin/entreprises");
  if (id) revalidatePath(`/admin/entreprises/${id}`);
}

// Charge une entreprise et vérifie que l'utilisateur en est propriétaire ou superviseur.
async function loadOwned(id: string, me: CurrentUser) {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Error("Entreprise introuvable");
  assertOwnerOrSupervisor(me, company.ownerId);
  return company;
}

export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_companies");
  const parsed = parseForm(companySchema, formData);
  if (!parsed.ok) return parsed.state;

  const existing = parsed.data.siret
    ? await prisma.company.findUnique({ where: { siret: parsed.data.siret } })
    : null;
  if (existing) return fieldError(formData, "siret", "Ce SIRET existe déjà");

  // Le créateur devient propriétaire : c'est son espace cloisonné.
  const company = await prisma.company.create({ data: { ...parsed.data, ownerId: me.id } });
  revalidate();
  redirect(`/admin/entreprises/${company.id}`);
}

export async function updateCompany(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_companies");
  await loadOwned(id, me);
  const parsed = parseForm(companySchema, formData);
  if (!parsed.ok) return parsed.state;

  const conflict = parsed.data.siret
    ? await prisma.company.findFirst({ where: { siret: parsed.data.siret, NOT: { id } } })
    : null;
  if (conflict) return fieldError(formData, "siret", "Ce SIRET existe déjà");

  await prisma.company.update({ where: { id }, data: parsed.data });
  revalidate(id);
  redirect(`/admin/entreprises/${id}`);
}

// Soft-delete : jamais de suppression physique (piège n°4).
export async function archiveCompany(id: string) {
  const me = await requirePermission("can_manage_companies");
  await loadOwned(id, me);
  await prisma.company.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidate(id);
  redirect("/admin/entreprises");
}

export async function restoreCompany(id: string) {
  const me = await requirePermission("can_manage_companies");
  await loadOwned(id, me);
  await prisma.company.update({ where: { id }, data: { archivedAt: null } });
  revalidate(id);
}

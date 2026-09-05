"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { assertOwnerOrSupervisor } from "@/lib/auth/ownership";
import { ProspectStatus } from "@/generated/prisma/enums";
import { parseForm, emptyToNull, type FormState } from "./shared";

const prospectSchema = z.object({
  companyId: z.string().uuid("Entreprise obligatoire"),
  status: z.nativeEnum(ProspectStatus),
  firstCallAt: z.preprocess(
    emptyToNull,
    z.coerce.date({ message: "Date invalide" }).nullable(),
  ),
  notes: z.preprocess(emptyToNull, z.string().trim().nullable()),
});

function revalidate(companyId: string) {
  revalidatePath("/admin/prospects");
  revalidatePath(`/admin/entreprises/${companyId}`);
}

// L'entreprise doit exister, être active et appartenir à l'utilisateur (ou superviseur).
async function loadOwnedCompany(companyId: string, me: CurrentUser) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.archivedAt) throw new Error("Entreprise introuvable ou archivée");
  assertOwnerOrSupervisor(me, company.ownerId);
  return company;
}

async function loadOwnedProspect(id: string, me: CurrentUser) {
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) throw new Error("Prospect introuvable");
  assertOwnerOrSupervisor(me, prospect.ownerId);
  return prospect;
}

export async function createProspect(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_companies");
  const parsed = parseForm(prospectSchema, formData);
  if (!parsed.ok) return parsed.state;
  const company = await loadOwnedCompany(parsed.data.companyId, me);

  // Le prospect appartient au propriétaire de l'entreprise (même espace cloisonné).
  await prisma.prospect.create({ data: { ...parsed.data, ownerId: company.ownerId } });
  revalidate(company.id);
  redirect(`/admin/entreprises/${company.id}`);
}

export async function updateProspect(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission("can_manage_companies");
  const current = await loadOwnedProspect(id, me);
  const parsed = parseForm(prospectSchema, formData);
  if (!parsed.ok) return parsed.state;

  // L'entreprise et le propriétaire d'un prospect ne changent pas après création.
  const { status, firstCallAt, notes } = parsed.data;
  await prisma.prospect.update({ where: { id }, data: { status, firstCallAt, notes } });
  revalidate(current.companyId);
  redirect(`/admin/entreprises/${current.companyId}`);
}

export async function archiveProspect(id: string) {
  const me = await requirePermission("can_manage_companies");
  await loadOwnedProspect(id, me);
  const p = await prisma.prospect.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidate(p.companyId);
}

export async function restoreProspect(id: string) {
  const me = await requirePermission("can_manage_companies");
  await loadOwnedProspect(id, me);
  const p = await prisma.prospect.update({ where: { id }, data: { archivedAt: null } });
  revalidate(p.companyId);
}

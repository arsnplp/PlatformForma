import type { Prisma } from "@/generated/prisma/client";

// Où vit une pile de blocs : dans une leçon, ou en introduction de la version
// (le mot d'accueil et le plan, tout en haut de la formation).
export type BlockTarget = { lessonId: string; formationVersionId?: never } | { formationVersionId: string; lessonId?: never };

// Filtre Prisma des blocs frères, c'est-à-dire ceux de la même pile.
export function blockScope(target: BlockTarget): Prisma.ContentBlockWhereInput {
  return target.lessonId ? { lessonId: target.lessonId } : { formationVersionId: target.formationVersionId };
}

// Point d'attache d'un bloc créé : exactement un des deux champs.
export function blockOwner(target: BlockTarget): { lessonId: string | null; formationVersionId: string | null } {
  return { lessonId: target.lessonId ?? null, formationVersionId: target.formationVersionId ?? null };
}

// Cible d'un bloc existant, lue depuis ses colonnes.
export function targetOf(block: { lessonId: string | null; formationVersionId: string | null }): BlockTarget {
  if (block.lessonId) return { lessonId: block.lessonId };
  if (block.formationVersionId) return { formationVersionId: block.formationVersionId };
  throw new Error("Bloc orphelin");
}

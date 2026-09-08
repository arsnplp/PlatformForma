"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { checkBlockTargetEdit } from "@/lib/storage/access";

// Introduction d'une formation : un mot d'accueil qu'on écrit directement,
// et des fichiers qu'on dépose à côté. On peut n'avoir que l'un, que l'autre,
// ou les deux — d'où deux mécanismes séparés plutôt qu'un éditeur de blocs.
//
// Le texte est UN bloc, toujours le premier : l'écrire n'oblige jamais à
// choisir « quel type de bloc » avant de taper.

const schema = z.object({ markdown: z.string().max(50_000, "Introduction trop longue") });

export async function saveIntroText(versionId: string, markdown: string) {
  const me = await requirePermission("can_edit_formation");
  const target = { formationVersionId: versionId } as const;
  if (!(await checkBlockTargetEdit(target, me))) return { error: "Cette version n'est plus modifiable." };

  const parsed = schema.safeParse({ markdown });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const text = parsed.data.markdown.trim();

  const existing = await prisma.contentBlock.findFirst({
    where: { formationVersionId: versionId, type: "text" },
    orderBy: { order: "asc" },
  });

  if (!text) {
    // Vidé, le bloc disparaît : l'introduction retrouve sa place vide.
    if (existing) await prisma.contentBlock.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.contentBlock.update({ where: { id: existing.id }, data: { payload: { markdown: text } } });
  } else {
    // Le mot d'accueil passe devant les fichiers déjà déposés.
    const others = await prisma.contentBlock.findMany({
      where: { formationVersionId: versionId },
      orderBy: { order: "desc" },
    });
    await prisma.$transaction(async (tx) => {
      for (const b of others) await tx.contentBlock.update({ where: { id: b.id }, data: { order: b.order + 1 } });
      await tx.contentBlock.create({
        data: { formationVersionId: versionId, order: 1, type: "text", payload: { markdown: text } },
      });
    });
  }

  const version = await prisma.formationVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { formationId: true },
  });
  revalidatePath(`/admin/formations/${version.formationId}`);
  return { ok: true };
}

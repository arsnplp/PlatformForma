import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// ═══════════════════════════════════════════════════════════════════════════
// CLOISONNEMENT DES FICHIERS
//
// Aucun fichier n'est accessible par une URL publique : le bucket est privé.
// Une URL signée n'est délivrée qu'après cette vérification, et elle expire
// en 60 secondes. Même en récupérant une URL, un tiers ne peut pas la rejouer
// durablement, et il ne peut pas en obtenir une nouvelle sans droit.
//
// Un fichier est lisible si l'utilisateur :
//   • possède la formation, ou supervise (can_view_all_dossiers) ;
//   • anime ou possède une session rattachée à la version qui contient le bloc ;
//   • est inscrit à une telle session (l'élève ne voit que SES formations).
//
// C'est exactement la règle SQL `app_can_read_version` du Palier 1, appliquée
// ici côté application puisque Prisma contourne le RLS.
// ═══════════════════════════════════════════════════════════════════════════

export type BlockAccess = { allowed: false } | { allowed: true; canEdit: boolean };

export async function checkBlockFileAccess(blockId: string, me: CurrentUser): Promise<BlockAccess> {
  const block = await prisma.contentBlock.findUnique({
    where: { id: blockId },
    select: {
      lesson: {
        select: {
          module: {
            select: {
              formationVersion: {
                select: {
                  id: true,
                  status: true,
                  formation: { select: { ownerId: true, archivedAt: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!block) return { allowed: false };

  const version = block.lesson.module.formationVersion;
  const owns = version.formation.ownerId === me.id;
  if (owns || canSupervise(me)) {
    return { allowed: true, canEdit: owns && version.status === "draft" && !version.formation.archivedAt };
  }

  // Formateur d'une session sur cette version, ou élève inscrit à une telle session.
  const linked = await prisma.session.count({
    where: {
      formationVersionId: version.id,
      OR: [{ ownerId: me.id }, { trainerId: me.id }, { enrollments: { some: { userId: me.id } } }],
    },
  });
  return linked > 0 ? { allowed: true, canEdit: false } : { allowed: false };
}

// Même règle pour agir sur une leçon (envoi d'un fichier) : édition seulement.
export async function checkLessonEdit(lessonId: string, me: CurrentUser): Promise<boolean> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { formationVersion: { select: { status: true, formation: { select: { ownerId: true, archivedAt: true } } } } } } },
  });
  if (!lesson) return false;
  const v = lesson.module.formationVersion;
  if (v.status !== "draft" || v.formation.archivedAt) return false;
  return v.formation.ownerId === me.id || canSupervise(me);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLOISONNEMENT DES LIVRABLES
//
// Un livrable déposé par un élève est plus sensible qu'un contenu de leçon :
// il n'est visible que par son auteur et par le formateur qui gère la session.
// Jamais par les autres élèves de la même session, même inscrits.
//
// C'est plus restrictif que checkBlockFileAccess : être inscrit à la session
// ne suffit pas, il faut être l'auteur.
// ═══════════════════════════════════════════════════════════════════════════

export type SubmissionAccess = { allowed: false } | { allowed: true; role: "author" | "trainer" };

export async function checkSubmissionAccess(submissionId: string, me: CurrentUser): Promise<SubmissionAccess> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { userId: true, session: { select: { ownerId: true, trainerId: true } } },
  });
  if (!submission) return { allowed: false };

  if (submission.userId === me.id) return { allowed: true, role: "author" };
  if (canSupervise(me) || submission.session.ownerId === me.id || submission.session.trainerId === me.id) {
    return { allowed: true, role: "trainer" };
  }
  return { allowed: false };
}

// Droit de corriger une soumission : formateur de la session, jamais l'élève.
export async function canGradeSubmission(submissionId: string, me: CurrentUser): Promise<boolean> {
  const access = await checkSubmissionAccess(submissionId, me);
  return access.allowed && access.role === "trainer";
}

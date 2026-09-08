"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/session";
import { generateStudentActivity, seeded, demoStudentName } from "@/lib/demo/generator";
import { rebuildTimeAggregates } from "@/lib/activity/rebuild";
import { removeFile } from "@/lib/storage/client";
import { DOCUMENT_BUCKET } from "@/lib/storage/config";

export type DemoState = { ok: boolean; message: string };

// ═══════════════════════════════════════════════════════════════════════════
// Réservé à can_generate_demo_data (super-admin). La vérification est FAITE
// CÔTÉ SERVEUR dans chaque action : masquer un bouton ne protège rien.
//
// Une donnée fabriquée ne doit jamais pouvoir passer pour une donnée vécue,
// d'où la règle qui traverse tout ce fichier : on ne fabrique que dans une
// session marquée démonstration.
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_EMAIL_DOMAIN = "demo.platforma.local";

export async function generateDemoSession(): Promise<DemoState> {
  const me = await requirePermission("can_generate_demo_data");
  const rand = seeded(`session:${Date.now()}`);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  const formation = await prisma.formation.create({
    data: {
      ownerId: me.id,
      name: `Démonstration — parcours complet (${stamp})`,
      sector: "Démonstration",
      description: "Formation fabriquée pour la démonstration. Aucune valeur pédagogique ni probante.",
    },
  });

  const version = await prisma.formationVersion.create({
    data: {
      formationId: formation.id, versionNumber: 1, status: "active",
      changelog: "Version de démonstration", createdById: me.id, publishedAt: new Date(),
    },
  });

  // Un programme crédible : trois modules, des leçons minutées, deux classes
  // virtuelles qui donneront leurs émargements.
  const plan = [
    { title: "Prendre en main la plateforme", lessons: [["Découvrir son espace", 45], ["Lire une leçon", 30]] as [string, number][], visio: "Classe virtuelle 1 — lancement" },
    { title: "Mettre en pratique", lessons: [["Étude de cas", 90], ["Atelier guidé", 60], ["Retour d'expérience", 40]] as [string, number][], visio: "Classe virtuelle 2 — atelier" },
    { title: "Consolider", lessons: [["Synthèse", 45], ["Aller plus loin", 30]] as [string, number][], visio: null },
  ];

  let moduleOrder = 0;
  for (const entry of plan) {
    const createdModule = await prisma.module.create({
      data: { formationVersionId: version.id, order: ++moduleOrder, title: entry.title },
    });
    let lessonOrder = 0;
    for (const [title, minutes] of entry.lessons) {
      const lesson = await prisma.lesson.create({
        data: { moduleId: createdModule.id, order: ++lessonOrder, title, durationMinutes: minutes },
      });
      await prisma.contentBlock.create({
        data: {
          lessonId: lesson.id, order: 1, type: "text",
          payload: { markdown: `## ${title}\n\nContenu de démonstration.\n\n- Point clé\n- Point clé\n- Point clé` },
        },
      });
      if (entry.visio && lessonOrder === 1) {
        await prisma.contentBlock.create({
          data: {
            lessonId: lesson.id, order: 2, type: "visio",
            payload: { title: entry.visio, durationMinutes: 120, note: "Séance de démonstration" },
          },
        });
      }
    }
  }

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 11);

  const session = await prisma.session.create({
    data: {
      ownerId: me.id, trainerId: me.id, formationVersionId: version.id,
      name: `Session de démonstration (${stamp})`,
      startDate: new Date(start.toISOString().slice(0, 10) + "T00:00:00.000Z"),
      endDate: new Date(end.toISOString().slice(0, 10) + "T00:00:00.000Z"),
      durationHours: 8, status: "running", isDemo: true,
    },
  });

  // Élèves fictifs : des lignes en base, sans compte de connexion. Ils peuplent
  // les listes, les émargements et les relevés, sans exister comme utilisateurs.
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "eleve" } });
  const students: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = demoStudentName(i, rand);
    // L'identifiant vient normalement de Supabase Auth ; un élève fictif n'a
    // pas de compte de connexion, on le génère donc ici.
    const user = await prisma.user.create({
      data: { id: randomUUID(), name, email: `demo-${randomUUID().slice(0, 8)}@${DEMO_EMAIL_DOMAIN}` },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.enrollment.create({ data: { sessionId: session.id, userId: user.id, isDemo: true } });
    await prisma.conversation.create({ data: { sessionId: session.id, userId: user.id } });
    students.push(user.id);
  }

  // Séances planifiées, puis émargements signés : le dossier est complet.
  const visioBlocks = await prisma.contentBlock.findMany({
    where: { type: "visio", lesson: { module: { formationVersionId: version.id } } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  let dayOffset = 1;
  for (const block of visioBlocks) {
    const startsAt = new Date(session.startDate);
    startsAt.setUTCDate(startsAt.getUTCDate() + dayOffset++);
    startsAt.setUTCHours(9, 0, 0, 0);
    const seance = await prisma.seance.create({
      data: {
        sessionId: session.id, contentBlockId: block.id, startsAt,
        durationMinutes: 120, joinUrl: "https://meet.google.com/demo-demo-demo",
      },
    });
    const day = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()));
    for (const userId of students) {
      const present = rand() > 0.15;
      await prisma.attendance.create({
        data: {
          sessionId: session.id, seanceId: seance.id, userId, day, slot: "am",
          status: present ? "signed" : "absent",
          signedAt: present ? new Date(startsAt.getTime() + 5 * 60_000) : null,
        },
      });
    }
  }

  for (const userId of students) {
    await generateStudentActivity({ sessionId: session.id, userId });
    await rebuildTimeAggregates(session.id, userId);
  }

  revalidatePath("/admin/demo");
  revalidatePath("/admin/sessions");
  return {
    ok: true,
    message: `Session de démonstration créée : ${plan.length} modules, ${visioBlocks.length} classes virtuelles, ${students.length} élèves avec activité et émargements.`,
  };
}

// Activité d'UN élève, régénérable à volonté, sur n'importe quelle session.
//
// Les traces produites restent marquées comme fabriquées : le relevé de temps
// est une mesure, et il doit pouvoir dire quand il n'en est pas une. Cette
// marque ne se voit qu'à l'endroit qui compte — le relevé et l'écran d'analyse
// — et n'entrave rien d'autre.
export async function generateActivityFor(sessionId: string, userId: string): Promise<DemoState> {
  await requirePermission("can_generate_demo_data");

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { isDemo: true, name: true } });
  if (!session) return { ok: false, message: "Session introuvable." };

  const result = await generateStudentActivity({ sessionId, userId });
  await rebuildTimeAggregates(sessionId, userId);

  revalidatePath(`/admin/eleves/${userId}`);
  revalidatePath(`/admin/sessions/${sessionId}`);
  return {
    ok: true,
    message: `Activité fabriquée : ${result.beats} relevés sur ${result.days} journée(s), ${result.submissions} exercice(s) rendu(s).`,
  };
}

// Efface l'activité fabriquée d'un élève sur une session, sans rien remplacer.
export async function clearActivityFor(sessionId: string, userId: string): Promise<DemoState> {
  await requirePermission("can_generate_demo_data");
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { isDemo: true } });
  if (!session) return { ok: false, message: "Session introuvable." };

  // Seules les traces fabriquées s'effacent : une connexion réelle est du vécu.
  const [, logs] = await prisma.$transaction([
    prisma.timeAggregate.deleteMany({ where: { sessionId, userId } }),
    prisma.activityLog.deleteMany({ where: { sessionId, userId, isDemo: true } }),
  ]);
  await rebuildTimeAggregates(sessionId, userId);
  revalidatePath(`/admin/eleves/${userId}`);
  return { ok: true, message: `${logs.count} trace(s) fabriquée(s) effacée(s).` };
}

// Purge : tout ce qui porte la marque de démonstration disparaît. Les
// émargements signés d'une session de démonstration sont exemptés du
// déclencheur d'inaltérabilité — une démonstration ne produit pas de preuve.
export async function purgeDemoData(): Promise<DemoState> {
  await requirePermission("can_generate_demo_data");

  const sessions = await prisma.session.findMany({ where: { isDemo: true }, select: { id: true, formationVersionId: true } });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return { ok: true, message: "Aucune donnée de démonstration à purger." };

  // Les fichiers partent du stockage avant les lignes qui les référencent.
  const documents = await prisma.document.findMany({ where: { sessionId: { in: sessionIds } }, select: { storagePath: true } });
  for (const document of documents) await removeFile(document.storagePath, DOCUMENT_BUCKET);

  const versionIds = [...new Set(sessions.map((s) => s.formationVersionId))];
  const students = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    await tx.timeAggregate.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.activityLog.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.submission.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.attendance.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.seance.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.document.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.message.deleteMany({ where: { conversation: { sessionId: { in: sessionIds } } } });
    await tx.conversationRead.deleteMany({ where: { conversation: { sessionId: { in: sessionIds } } } });
    await tx.conversation.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.stepExecution.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.stepInstance.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.enrollment.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await tx.session.deleteMany({ where: { id: { in: sessionIds } } });

    // Les formations créées pour la démonstration, si plus aucune session ne
    // les utilise.
    const orphanVersions = await tx.formationVersion.findMany({
      where: { id: { in: versionIds }, sessions: { none: {} }, formation: { sector: "Démonstration" } },
      select: { id: true, formationId: true },
    });
    for (const version of orphanVersions) {
      const lessons = await tx.lesson.findMany({ where: { module: { formationVersionId: version.id } }, select: { id: true } });
      const lessonIds = lessons.map((l) => l.id);
      await tx.contentBlock.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await tx.exercise.deleteMany({ where: { OR: [{ lessonId: { in: lessonIds } }, { module: { formationVersionId: version.id } }] } });
      await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      await tx.stepTemplate.deleteMany({ where: { processTemplate: { formationVersionId: version.id } } });
      await tx.processTemplate.deleteMany({ where: { formationVersionId: version.id } });
      await tx.messageTemplate.deleteMany({ where: { formationVersionId: version.id } });
      await tx.module.deleteMany({ where: { formationVersionId: version.id } });
      await tx.formationVersion.delete({ where: { id: version.id } });
      await tx.formation.deleteMany({ where: { id: version.formationId, versions: { none: {} } } });
    }

    // Les élèves fictifs, qui n'ont ni compte de connexion ni existence ailleurs.
    if (studentIds.length > 0) {
      await tx.userRole.deleteMany({ where: { userId: { in: studentIds } } });
      await tx.accessLog.deleteMany({ where: { OR: [{ userId: { in: studentIds } }, { targetId: { in: studentIds } }] } });
      await tx.user.deleteMany({ where: { id: { in: studentIds }, enrollments: { none: {} } } });
    }
  }, { timeout: 30_000 });

  revalidatePath("/admin/demo");
  revalidatePath("/admin/sessions");
  return { ok: true, message: `${sessionIds.length} session(s) de démonstration purgée(s), avec leurs élèves fictifs et leurs pièces.` };
}

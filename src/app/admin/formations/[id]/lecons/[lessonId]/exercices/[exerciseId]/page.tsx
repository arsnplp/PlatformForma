import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateExercise } from "@/lib/actions/exercises";
import { defaultConfig, parseConfig, type AnyConfig } from "@/lib/content/exercise-config";
import { PageHeader } from "@/components/admin/page-header";
import { ExerciseForm } from "@/components/content/exercise-form";

export default async function EditExercisePage({ params }: PageProps<"/admin/formations/[id]/lecons/[lessonId]/exercices/[exerciseId]">) {
  const { id, lessonId, exerciseId } = await params;
  const me = await requireUser(`/admin/formations/${id}/lecons/${lessonId}`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { lesson: { include: { module: { include: { formationVersion: { include: { formation: true } } } } } } },
  });
  const version = exercise?.lesson?.module.formationVersion;
  const formation = version?.formation;
  if (!exercise || !exercise.lesson || !version || !formation || formation.id !== id || exercise.lessonId !== lessonId || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const back = `/admin/formations/${id}/lecons/${lessonId}`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  // Une configuration ancienne ou invalide retombe sur celle par défaut du type.
  const parsed = parseConfig(exercise.type, exercise.config);
  const config = (parsed.success ? parsed.data : defaultConfig(exercise.type)) as AnyConfig;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier l'exercice"
        description={`Leçon « ${exercise.lesson.title} » · v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: `/admin/formations/${id}?v=${version.versionNumber}&tab=content` },
          { label: exercise.lesson.title, href: back },
        ]}
      />
      <ExerciseForm
        action={updateExercise.bind(null, exercise.id)}
        initial={{
          type: exercise.type,
          title: exercise.title,
          statement: exercise.statement,
          correctionMode: exercise.correctionMode,
          maxScore: exercise.maxScore,
          config,
        }}
        cancelHref={back}
        submitLabel="Enregistrer"
      />
    </div>
  );
}

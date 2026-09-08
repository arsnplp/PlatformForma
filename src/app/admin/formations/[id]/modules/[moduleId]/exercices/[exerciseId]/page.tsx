import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateExercise } from "@/lib/actions/exercises";
import { defaultConfig, parseConfig, type AnyConfig } from "@/lib/content/exercise-config";
import { PageHeader } from "@/components/admin/page-header";
import { ExerciseForm } from "@/components/content/exercise-form";

export default async function EditModuleExercisePage({ params }: PageProps<"/admin/formations/[id]/modules/[moduleId]/exercices/[exerciseId]">) {
  const { id, moduleId, exerciseId } = await params;
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { module: { include: { formationVersion: { include: { formation: true } } } } },
  });
  const version = exercise?.module?.formationVersion;
  const formation = version?.formation;
  if (
    !exercise || !exercise.module || !version || !formation ||
    formation.id !== id || exercise.moduleId !== moduleId ||
    !isOwnerOrSupervisor(me, formation.ownerId)
  ) notFound();
  const back = `/admin/formations/${id}?v=${version.versionNumber}&tab=content`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  // Une configuration ancienne ou invalide retombe sur celle par défaut du type.
  const parsed = parseConfig(exercise.type, exercise.config);
  const config = (parsed.success ? parsed.data : defaultConfig(exercise.type)) as AnyConfig;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier l'exercice"
        description={`Fin du module « ${exercise.module.title} » · v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: back },
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

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { createExercise } from "@/lib/actions/exercises";
import { PageHeader } from "@/components/admin/page-header";
import { ExerciseForm } from "@/components/content/exercise-form";

// Exercice de fin de module : même formulaire que pour une leçon, autre attache.
export default async function NewModuleExercisePage({ params }: PageProps<"/admin/formations/[id]/modules/[moduleId]/exercices/nouveau">) {
  const { id, moduleId } = await params;
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const parentModule = await prisma.module.findUnique({
    where: { id: moduleId },
    include: { formationVersion: { include: { formation: true } } },
  });
  const version = parentModule?.formationVersion;
  const formation = version?.formation;
  if (!parentModule || !version || !formation || formation.id !== id || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const back = `/admin/formations/${id}?v=${version.versionNumber}&tab=content`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvel exercice de fin de module"
        description={`Module « ${parentModule.title} » · v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: back },
        ]}
      />
      <ExerciseForm action={createExercise.bind(null, { moduleId })} cancelHref={back} submitLabel="Créer l'exercice" />
    </div>
  );
}

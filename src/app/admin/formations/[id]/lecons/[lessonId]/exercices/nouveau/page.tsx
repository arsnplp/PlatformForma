import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { createExercise } from "@/lib/actions/exercises";
import { PageHeader } from "@/components/admin/page-header";
import { ExerciseForm } from "@/components/content/exercise-form";
import { ExerciseList } from "@/components/content/exercise-list";
import { ExerciseLibrary } from "@/components/content/exercise-library";

export default async function NewExercisePage({ params, searchParams }: PageProps<"/admin/formations/[id]/lecons/[lessonId]/exercices/nouveau">) {
  const { id, lessonId } = await params;
  const { cree, q } = await searchParams;
  const created = typeof cree === "string" ? cree : null;
  const me = await requireUser(`/admin/formations/${id}/lecons/${lessonId}`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { formationVersion: { include: { formation: true } } } } },
  });
  const version = lesson?.module.formationVersion;
  const formation = version?.formation;
  if (!lesson || !version || !formation || formation.id !== id || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const back = `/admin/formations/${id}/lecons/${lessonId}`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvel exercice"
        description={`Leçon « ${lesson.title} » · v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: `/admin/formations/${id}?v=${version.versionNumber}&tab=content` },
          { label: lesson.title, href: back },
        ]}
      />
      {created ? (
        <p className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
          « {created} » a été créé. Le formulaire est vierge : enchaîne, ou reviens à la leçon.
        </p>
      ) : null}

      {/* Le formulaire repart à zéro à chaque création : la clé force le remontage. */}
      <ExerciseForm
        key={created ?? "vierge"}
        action={createExercise.bind(null, { lessonId })}
        cancelHref={back}
        submitLabel="Créer l'exercice"
      />

      <ExerciseList formationId={id} target={{ lessonId }} editable compact />

      <ExerciseLibrary target={{ lessonId }} search={typeof q === "string" ? q : undefined} />
    </div>
  );
}

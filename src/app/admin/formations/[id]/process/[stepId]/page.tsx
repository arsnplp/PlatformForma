import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateStep } from "@/lib/actions/process";
import { readSendMessageParams } from "@/lib/process/action-params";
import { listTrainers } from "@/lib/queries/users";
import { PageHeader } from "@/components/admin/page-header";
import { StepForm } from "@/components/formations/step-form";

export default async function EditStepPage({ params }: PageProps<"/admin/formations/[id]/process/[stepId]">) {
  const { id, stepId } = await params;
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_process_template")) redirect("/admin");

  const step = await prisma.stepTemplate.findUnique({
    where: { id: stepId },
    include: { processTemplate: { include: { formationVersion: { include: { formation: true } } } } },
  });
  const version = step?.processTemplate.formationVersion;
  const formation = version?.formation;
  if (!step || !version || !formation || formation.id !== id || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const back = `/admin/formations/${id}?v=${version.versionNumber}&tab=process`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  const [users, roles, templates] = await Promise.all([
    listTrainers(),
    prisma.role.findMany({ select: { id: true, label: true }, orderBy: { label: "asc" } }),
    prisma.messageTemplate.findMany({ where: { formationVersionId: version.id, archivedAt: null }, select: { id: true, name: true, subject: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const params0 = readSendMessageParams(step.actionParams);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier l'étape"
        description={`Process de « ${formation.name} » v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: back },
        ]}
      />
      <StepForm
        mode="edit"
        action={updateStep.bind(null, step.id)}
        users={users}
        roles={roles}
        templates={templates}
        initial={{ ...step, messageTemplateId: params0?.templateId ?? null, recipient: params0?.recipient ?? null }}
        cancelHref={back}
      />
    </div>
  );
}

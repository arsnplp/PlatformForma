import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { createStep } from "@/lib/actions/process";
import { listTrainers } from "@/lib/queries/users";
import { PageHeader } from "@/components/admin/page-header";
import { StepForm } from "@/components/formations/step-form";

export default async function NewStepPage({ params, searchParams }: PageProps<"/admin/formations/[id]/process/nouvelle">) {
  const { id } = await params;
  const { v } = await searchParams;
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_process_template")) redirect("/admin");

  const formation = await prisma.formation.findUnique({ where: { id }, include: { versions: true } });
  if (!formation || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const version = formation.versions.find((x) => String(x.versionNumber) === v);
  if (!version) notFound();
  const back = `/admin/formations/${id}?v=${version.versionNumber}&tab=process`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  const [users, roles, templates] = await Promise.all([
    listTrainers(),
    prisma.role.findMany({ select: { id: true, label: true }, orderBy: { label: "asc" } }),
    prisma.messageTemplate.findMany({ where: { formationVersionId: version.id, archivedAt: null }, select: { id: true, name: true, subject: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvelle étape"
        description={`Process de « ${formation.name} » v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: back },
        ]}
      />
      <StepForm mode="create" action={createStep.bind(null, version.id)} users={users} roles={roles} templates={templates} initial={{ assigneeUserId: formation.ownerId }} cancelHref={back} />
    </div>
  );
}

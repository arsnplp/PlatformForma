import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateMessageTemplate } from "@/lib/actions/message-templates";
import { PageHeader } from "@/components/admin/page-header";
import { MessageTemplateForm } from "@/components/formations/message-template-form";

export default async function EditTemplatePage({ params }: PageProps<"/admin/formations/[id]/mails/[templateId]">) {
  const { id, templateId } = await params;
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_process_template")) redirect("/admin");

  const template = await prisma.messageTemplate.findUnique({
    where: { id: templateId },
    include: { formationVersion: { include: { formation: true } } },
  });
  const version = template?.formationVersion;
  const formation = version?.formation;
  if (!template || !version || !formation || formation.id !== id || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const back = `/admin/formations/${id}?v=${version.versionNumber}&tab=mails`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier le template"
        description={`« ${formation.name} » v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: back },
        ]}
      />
      <MessageTemplateForm mode="edit" action={updateMessageTemplate.bind(null, template.id)} initial={template} cancelHref={back} />
    </div>
  );
}

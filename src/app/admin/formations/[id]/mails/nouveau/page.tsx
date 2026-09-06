import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { createMessageTemplate } from "@/lib/actions/message-templates";
import { PageHeader } from "@/components/admin/page-header";
import { MessageTemplateForm } from "@/components/formations/message-template-form";

export default async function NewTemplatePage({ params, searchParams }: PageProps<"/admin/formations/[id]/mails/nouveau">) {
  const { id } = await params;
  const { v } = await searchParams;
  const me = await requireUser(`/admin/formations/${id}`);
  if (!hasPermission(me, "can_edit_process_template")) redirect("/admin");

  const formation = await prisma.formation.findUnique({ where: { id }, include: { versions: true } });
  if (!formation || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  const version = formation.versions.find((x) => String(x.versionNumber) === v);
  if (!version) notFound();
  const back = `/admin/formations/${id}?v=${version.versionNumber}&tab=mails`;
  if (version.status !== "draft" || formation.archivedAt) redirect(back);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouveau template de mail"
        description={`« ${formation.name} » v${version.versionNumber} (brouillon).`}
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: back },
        ]}
      />
      <MessageTemplateForm mode="create" action={createMessageTemplate.bind(null, version.id)} cancelHref={back} />
    </div>
  );
}

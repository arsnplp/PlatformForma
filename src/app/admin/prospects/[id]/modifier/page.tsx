import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateProspect } from "@/lib/actions/prospects";
import { toDateTimeLocal } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { ProspectForm } from "@/components/prospects/prospect-form";

export default async function EditProspectPage({ params }: PageProps<"/admin/prospects/[id]/modifier">) {
  const { id } = await params;
  const me = await requireUser(`/admin/prospects/${id}/modifier`);
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");

  const prospect = await prisma.prospect.findUnique({ where: { id }, include: { company: true } });
  if (!prospect || !isOwnerOrSupervisor(me, prospect.ownerId)) notFound();
  if (prospect.archivedAt) redirect(`/admin/entreprises/${prospect.companyId}`);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier le prospect"
        breadcrumb={[
          { label: "Entreprises", href: "/admin/entreprises" },
          { label: prospect.company.name, href: `/admin/entreprises/${prospect.companyId}` },
        ]}
      />
      <ProspectForm
        mode="edit"
        action={updateProspect.bind(null, id)}
        companies={[{ id: prospect.company.id, name: prospect.company.name }]}
        initial={{
          companyId: prospect.companyId,
          status: prospect.status,
          firstCallAt: toDateTimeLocal(prospect.firstCallAt),
          notes: prospect.notes,
        }}
        cancelHref={`/admin/entreprises/${prospect.companyId}`}
      />
    </div>
  );
}

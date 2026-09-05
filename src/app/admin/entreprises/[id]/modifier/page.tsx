import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateCompany } from "@/lib/actions/companies";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyForm } from "@/components/companies/company-form";

export default async function EditCompanyPage({ params }: PageProps<"/admin/entreprises/[id]/modifier">) {
  const { id } = await params;
  const me = await requireUser(`/admin/entreprises/${id}/modifier`);
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company || !isOwnerOrSupervisor(me, company.ownerId)) notFound();
  if (company.archivedAt) redirect(`/admin/entreprises/${id}`);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier l'entreprise"
        breadcrumb={[
          { label: "Entreprises", href: "/admin/entreprises" },
          { label: company.name, href: `/admin/entreprises/${id}` },
        ]}
      />
      <CompanyForm action={updateCompany.bind(null, id)} initial={company} cancelHref={`/admin/entreprises/${id}`} />
    </div>
  );
}

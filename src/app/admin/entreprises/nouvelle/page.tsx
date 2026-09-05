import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { createCompany } from "@/lib/actions/companies";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyForm } from "@/components/companies/company-form";

export default async function NewCompanyPage() {
  const me = await requireUser("/admin/entreprises/nouvelle");
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");

  return (
    <div className="space-y-8">
      <PageHeader title="Nouvelle entreprise" breadcrumb={[{ label: "Entreprises", href: "/admin/entreprises" }]} />
      <CompanyForm action={createCompany} cancelHref="/admin/entreprises" />
    </div>
  );
}

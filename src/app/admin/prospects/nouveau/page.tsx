import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { createProspect } from "@/lib/actions/prospects";
import { listActiveCompanies } from "@/lib/queries/companies";
import { ProspectStatus } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/admin/page-header";
import { ProspectForm } from "@/components/prospects/prospect-form";

export default async function NewProspectPage({ searchParams }: PageProps<"/admin/prospects/nouveau">) {
  const me = await requireUser("/admin/prospects/nouveau");
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");

  const { companyId } = await searchParams;
  const companies = await listActiveCompanies(me);
  // Pré-sélection uniquement si l'entreprise est dans mon périmètre.
  const preselected = typeof companyId === "string" && companies.some((c) => c.id === companyId) ? companyId : "";

  return (
    <div className="space-y-8">
      <PageHeader title="Nouveau prospect" breadcrumb={[{ label: "Prospects", href: "/admin/prospects" }]} />
      <ProspectForm
        mode="create"
        action={createProspect}
        companies={companies}
        initial={
          preselected
            ? { companyId: preselected, status: ProspectStatus.new, firstCallAt: "", notes: null }
            : undefined
        }
        cancelHref={preselected ? `/admin/entreprises/${preselected}` : "/admin/prospects"}
      />
    </div>
  );
}

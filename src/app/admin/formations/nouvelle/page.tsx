import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { createFormation } from "@/lib/actions/formations";
import { PageHeader } from "@/components/admin/page-header";
import { FormationForm } from "@/components/formations/formation-form";

export default async function NewFormationPage() {
  const me = await requireUser("/admin/formations/nouvelle");
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvelle formation"
        description="Elle démarre en brouillon v1. Tu ajoutes son contenu, puis tu publies."
        breadcrumb={[{ label: "Formations", href: "/admin/formations" }]}
      />
      <FormationForm action={createFormation} cancelHref="/admin/formations" />
    </div>
  );
}

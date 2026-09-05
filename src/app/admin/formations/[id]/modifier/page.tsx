import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateFormation } from "@/lib/actions/formations";
import { PageHeader } from "@/components/admin/page-header";
import { FormationForm } from "@/components/formations/formation-form";

export default async function EditFormationPage({ params }: PageProps<"/admin/formations/[id]/modifier">) {
  const { id } = await params;
  const me = await requireUser(`/admin/formations/${id}/modifier`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const formation = await prisma.formation.findUnique({ where: { id } });
  if (!formation || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();
  if (formation.archivedAt) redirect(`/admin/formations/${id}`);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier l'identité"
        description="Nom, secteur et description ne sont pas versionnés. Pour changer le contenu, crée une nouvelle version."
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: `/admin/formations/${id}` },
        ]}
      />
      <FormationForm action={updateFormation.bind(null, id)} initial={formation} cancelHref={`/admin/formations/${id}`} />
    </div>
  );
}

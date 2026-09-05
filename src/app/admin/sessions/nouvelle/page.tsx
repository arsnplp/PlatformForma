import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { createSession } from "@/lib/actions/sessions";
import { listFormationsWithPublishedVersions } from "@/lib/queries/formations";
import { listActiveCompanies } from "@/lib/queries/companies";
import { listTrainers } from "@/lib/queries/users";
import { PageHeader } from "@/components/admin/page-header";
import { SessionForm } from "@/components/sessions/session-form";

export default async function NewSessionPage({ searchParams }: PageProps<"/admin/sessions/nouvelle">) {
  const me = await requireUser("/admin/sessions/nouvelle");
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");
  const { formationId } = await searchParams;

  const [formations, companies, trainers] = await Promise.all([
    listFormationsWithPublishedVersions(me),
    listActiveCompanies(me),
    listTrainers(),
  ]);
  const preselected = typeof formationId === "string" && formations.some((f) => f.id === formationId) ? formationId : "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvelle session"
        description="Rattachée à une version publiée. Par défaut la version active ; une version remplacée reste possible pour rejouer un ancien programme."
        breadcrumb={[{ label: "Sessions", href: "/admin/sessions" }]}
      />
      <SessionForm
        mode="create"
        action={createSession}
        formations={formations}
        companies={companies}
        trainers={trainers}
        initial={{ formationId: preselected, trainerId: me.id }}
        cancelHref={preselected ? `/admin/formations/${preselected}` : "/admin/sessions"}
      />
    </div>
  );
}

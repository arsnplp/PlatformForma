import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { updateSession } from "@/lib/actions/sessions";
import { listActiveCompanies } from "@/lib/queries/companies";
import { listTrainers } from "@/lib/queries/users";
import { PageHeader } from "@/components/admin/page-header";
import { SessionForm } from "@/components/sessions/session-form";

const toInputDate = (d: Date) => d.toISOString().slice(0, 10);

export default async function EditSessionPage({ params }: PageProps<"/admin/sessions/[id]/modifier">) {
  const { id } = await params;
  const me = await requireUser(`/admin/sessions/${id}/modifier`);
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");

  const session = await prisma.session.findUnique({
    where: { id },
    include: { formationVersion: { include: { formation: { select: { id: true, name: true } } } } },
  });
  if (!session || !isOwnerOrSupervisor(me, session.ownerId)) notFound();
  const [companies, trainers] = await Promise.all([listActiveCompanies(me), listTrainers()]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Modifier la session"
        breadcrumb={[
          { label: "Sessions", href: "/admin/sessions" },
          { label: session.name, href: `/admin/sessions/${id}` },
        ]}
      />
      <SessionForm
        mode="edit"
        action={updateSession.bind(null, id)}
        formations={[]}
        companies={companies}
        trainers={trainers}
        lockedVersionLabel={`${session.formationVersion.formation.name} · v${session.formationVersion.versionNumber}`}
        initial={{
          name: session.name,
          formationId: session.formationVersion.formation.id,
          formationVersionId: session.formationVersionId,
          companyId: session.companyId,
          trainerId: session.trainerId,
          startDate: toInputDate(session.startDate),
          endDate: toInputDate(session.endDate),
          durationHours: session.durationHours == null ? "" : String(session.durationHours),
          status: session.status,
        }}
        cancelHref={`/admin/sessions/${id}`}
      />
    </div>
  );
}

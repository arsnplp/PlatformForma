import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor, canSupervise } from "@/lib/auth/ownership";
import { archiveCompany, restoreCompany } from "@/lib/actions/companies";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyDocuments } from "@/components/documents/company-documents";
import { SlotGrid } from "@/components/documents/slot-grid";
import { SlotCreate } from "@/components/documents/slot-create";
import { InviteContactForm } from "@/components/admin/invite-contact-form";
import { listCompanySlots } from "@/lib/queries/slots";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";

export default async function CompanyPage({ params }: PageProps<"/admin/entreprises/[id]">) {
  const { id } = await params;
  const me = await requireUser(`/admin/entreprises/${id}`);
  if (!hasPermission(me, "can_manage_companies")) redirect("/admin");

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      _count: { select: { sessions: true } },
    },
  });
  // Une entreprise d'un autre formateur n'existe pas pour moi (cloisonnement).
  if (!company || !isOwnerOrSupervisor(me, company.ownerId)) notFound();
  const isArchived = Boolean(company.archivedAt);

  // Le contact qui a déjà un accès, s'il existe : un seul suffit par entreprise.
  const contact = await prisma.user.findFirst({
    where: { companyId: company.id, userRoles: { some: { role: { key: "entreprise" } } }, archivedAt: null },
    select: { name: true, email: true, createdAt: true },
  });
  const slots = await listCompanySlots(company.id);

  const info: [string, string | null][] = [
    ["SIRET", company.siret],
    ["Secteur", company.sector],
    ["Contact", company.contactName],
    ["Email", company.contactEmail],
    ["Téléphone", company.contactPhone],
    ["Adresse", company.address],
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumb={[{ label: "Entreprises", href: "/admin/entreprises" }]}
        title={
          <span className="flex items-center gap-3">
            {company.name}
            {isArchived ? <StatusBadge tone="purple">Archivée</StatusBadge> : null}
          </span>
        }
        description={isArchived ? `Archivée le ${formatDate(company.archivedAt)}. Ses données restent intactes.` : undefined}
        actions={
          isArchived ? (
            <form action={restoreCompany.bind(null, company.id)}>
              <Button type="submit" variant="outline" size="sm">
                Restaurer
              </Button>
            </form>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/entreprises/${company.id}/modifier`}>Modifier</Link>
              </Button>
              <ConfirmButton
                action={archiveCompany.bind(null, company.id)}
                title="Archiver cette entreprise ?"
                description="Elle quitte les listes actives. Ses sessions et ses documents restent intacts et consultables."
                confirmLabel="Archiver"
              >
                Archiver
              </ConfirmButton>
            </>
          )
        }
      />

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {info.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-24 shrink-0 text-foreground-secondary">{k}</dt>
            <dd className="min-w-0 break-words">{v ?? <span className="text-foreground-tertiary">—</span>}</dd>
          </div>
        ))}
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-foreground-secondary">Sessions</dt>
          <dd className="tabular-nums">{company._count.sessions}</dd>
        </div>
        {canSupervise(me) ? (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-foreground-secondary">Propriétaire</dt>
            <dd>{company.owner.name}</dd>
          </div>
        ) : null}
      </dl>

      {/* ─── Accès du contact ───────────────────────────────────────────── */}
      {!isArchived ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Accès à l&apos;espace entreprise</h2>
          {contact ? (
            <p className="text-sm text-foreground-secondary">
              <strong className="text-foreground">{contact.name}</strong> ({contact.email}) a son accès depuis le{" "}
              {formatDate(contact.createdAt)}. Il voit les formations de vos salariés et le dossier
              de l&apos;entreprise, jamais leur travail.
            </p>
          ) : (
            <InviteContactForm
              companyId={company.id}
              defaultName={company.contactName}
              defaultEmail={company.contactEmail}
            />
          )}
        </section>
      ) : null}

      {/* ─── Espace commun avec l'entreprise ────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Espace commun — ce que j&apos;attends de l&apos;entreprise</h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            Un emplacement par pièce attendue. Point rouge : la balle est dans son camp.
          </p>
        </div>
        <SlotGrid
          slots={slots}
          role="staff"
          emptyLabel="Aucune demande en cours pour cette entreprise."
        />
        {!isArchived ? <SlotCreate holder={{ companyId: company.id }} /> : null}
      </section>

      {/* ─── Pièces déposées par le formateur ───────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Pièces que je dépose au dossier</h2>
        <p className="-mt-2 text-sm text-foreground-secondary">
          Conventions, devis, factures. Aucun élève n&apos;y a accès.
        </p>
        <CompanyDocuments companyId={company.id} readOnly={isArchived} />
      </section>
    </div>
  );
}

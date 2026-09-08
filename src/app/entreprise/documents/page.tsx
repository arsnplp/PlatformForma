import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getContactCompany } from "@/lib/queries/company-space";
import { listCompanySlots } from "@/lib/queries/slots";
import { SlotGrid } from "@/components/documents/slot-grid";
import { DocumentList } from "@/components/documents/document-list";
import { UnreadBadge } from "@/components/admin/unread-badge";

// Le dossier de l'entreprise : ce qu'on lui demande, et ce qu'elle a déjà.
// Rien des dossiers de ses salariés — leurs pièces ne lui appartiennent pas.
export default async function EntrepriseDocumentsPage() {
  const me = await requireUser("/entreprise/documents");
  const company = await getContactCompany(me);
  if (!company) notFound();

  const slots = await listCompanySlots(company.id);
  const waiting = slots.filter((s) => s.waitingOnHolder).length;
  const documents = await prisma.document.findMany({
    where: { companyId: company.id, archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: { slot: { select: { id: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/entreprise" className="text-sm text-foreground-secondary hover:text-foreground">
          ← {company.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Documents de l&apos;entreprise</h1>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">À faire</h2>
          <UnreadBadge count={waiting} />
        </div>
        <p className="text-sm text-foreground-secondary">
          {waiting === 0
            ? "Rien à fournir ni à signer pour l'instant."
            : "Un point rouge signale ce qui manque encore."}
        </p>
        <SlotGrid slots={slots} role="holder" emptyLabel="Votre organisme ne vous demande rien pour l'instant." />
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Vos pièces</h2>
        <p className="text-sm text-foreground-secondary">
          Conventions, devis et factures de {company.name}.
        </p>
        <DocumentList
          documents={documents.filter((d) => !d.slot)}
          signable
          emptyLabel="Aucune pièce pour l'instant"
        />
      </section>
    </div>
  );
}

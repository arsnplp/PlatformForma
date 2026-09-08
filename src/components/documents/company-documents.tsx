import { prisma } from "@/lib/prisma";
import { DocumentList } from "./document-list";
import { DocumentUpload } from "./document-upload";

// Pièces d'une entreprise, toutes sessions confondues.
export async function CompanyDocuments({ companyId, readOnly = false }: { companyId: string; readOnly?: boolean }) {
  const documents = await prisma.document.findMany({
    where: { companyId },
    orderBy: [{ phase: "asc" }, { createdAt: "desc" }],
    include: { session: { select: { name: true } } },
  });

  return (
    <div className="space-y-3">
      <DocumentList
        manageable={!readOnly}
        documents={documents.map((d) => ({ ...d, holder: d.session?.name ?? null }))}
        emptyLabel="Aucune pièce pour cette entreprise"
      />
      {!readOnly ? <DocumentUpload target={{ companyId }} label="Déposer une pièce d'entreprise" /> : null}
    </div>
  );
}

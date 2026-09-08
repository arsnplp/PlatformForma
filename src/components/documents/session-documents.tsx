import { prisma } from "@/lib/prisma";
import { DocumentList, type DocumentRow } from "./document-list";
import { DocumentUpload } from "./document-upload";

// Pièces d'une session : celles de l'entreprise cliente d'un côté, celles des
// élèves de l'autre. La séparation est visuelle autant que juridique — une
// convention n'a rien à faire dans le dossier d'un élève, et réciproquement.
export async function SessionDocuments({
  sessionId,
  companyId,
  readOnly = false,
}: {
  sessionId: string;
  companyId: string | null;
  readOnly?: boolean;
}) {
  const documents = await prisma.document.findMany({
    where: { sessionId },
    orderBy: [{ phase: "asc" }, { createdAt: "desc" }],
    include: { owner: { select: { name: true } } },
  });

  const toRow = (d: (typeof documents)[number]): DocumentRow => ({ ...d, holder: d.owner?.name ?? null });
  const company = documents.filter((d) => !d.ownerUserId).map(toRow);
  const students = documents.filter((d) => d.ownerUserId).map(toRow);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Pièces de l&apos;entreprise et de la session</h3>
        <p className="-mt-2 text-sm text-foreground-secondary">
          Convention, devis, facture, feuilles d&apos;émargement. Aucun élève n&apos;y a accès.
        </p>
        <DocumentList documents={company} manageable={!readOnly} emptyLabel="Aucune pièce d'entreprise" />
        {!readOnly && companyId ? (
          <DocumentUpload target={{ companyId, sessionId }} label="Déposer une pièce d'entreprise" />
        ) : null}
        {!readOnly && !companyId ? (
          <p className="text-sm text-foreground-tertiary">
            Session sans entreprise cliente : les pièces d&apos;entreprise se déposent depuis une fiche entreprise.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Pièces des élèves</h3>
        <p className="-mt-2 text-sm text-foreground-secondary">
          Contrat, convocation, attestation. Chaque élève ne voit que les siennes.
        </p>
        <DocumentList documents={students} manageable={!readOnly} emptyLabel="Aucune pièce d'élève" />
      </div>
    </div>
  );
}

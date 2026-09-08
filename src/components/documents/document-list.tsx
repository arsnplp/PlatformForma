import Link from "next/link";
import { DOCUMENT_TYPES, SIGNATURE_STATUS, phaseLabel } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { formatBytes } from "@/lib/storage/config";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { archiveDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/button";
import type { DocumentType, SignatureStatus } from "@/generated/prisma/enums";

export type DocumentRow = {
  id: string;
  title: string;
  type: DocumentType;
  phase: number | null;
  sizeBytes: number | null;
  createdAt: Date;
  signatureStatus: SignatureStatus;
  signedAt: Date | null;
  archivedAt: Date | null;
  isDemo: boolean;
  holder?: string | null;
};

// Liste des pièces d'un dossier. `manageable` distingue la vue formateur
// (retrait possible) de la vue élève, qui ne fait que lire les siennes.
export function DocumentList({
  documents,
  manageable = false,
  emptyLabel = "Aucune pièce au dossier",
}: {
  documents: DocumentRow[];
  manageable?: boolean;
  emptyLabel?: string;
}) {
  const visible = manageable ? documents : documents.filter((d) => !d.archivedAt);
  if (visible.length === 0) {
    return <EmptyState title={emptyLabel}>Contrats, conventions, émargements et attestations se rangent ici.</EmptyState>;
  }

  return (
    <ol className="divide-y rounded-md border">
      {visible.map((d) => {
        const sig = SIGNATURE_STATUS[d.signatureStatus];
        return (
          <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {d.archivedAt ? <span className="text-foreground-tertiary line-through">{d.title}</span> : d.title}
                {d.signatureStatus !== "na" ? <StatusBadge tone={sig.tone}>{sig.label}</StatusBadge> : null}
                {d.isDemo ? <StatusBadge tone="orange">Démo</StatusBadge> : null}
                {d.archivedAt ? <StatusBadge tone="gray">Retirée</StatusBadge> : null}
              </p>
              <p className="mt-0.5 text-xs text-foreground-secondary">
                {DOCUMENT_TYPES[d.type].label}
                {d.phase !== null ? ` · P${d.phase} ${phaseLabel(d.phase)}` : ""}
                {d.holder ? ` · ${d.holder}` : ""}
                {" · déposée le "}{formatDate(d.createdAt)}
                {d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ""}
                {d.signedAt ? ` · signée le ${formatDate(d.signedAt)}` : ""}
              </p>
            </div>

            {d.archivedAt ? null : (
              <span className="flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer">Ouvrir</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/api/documents/${d.id}?download=1`}>Télécharger</Link>
                </Button>
                {manageable && d.signatureStatus === "na" ? (
                  <ConfirmButton
                    action={archiveDocument.bind(null, d.id)}
                    title={`Retirer « ${d.title} » ?`}
                    description="Le fichier est supprimé du stockage. La trace du dépôt et de son retrait reste au dossier : à n'utiliser que pour un dépôt erroné."
                    confirmLabel="Retirer"
                    variant="ghost"
                  >
                    Retirer
                  </ConfirmButton>
                ) : null}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

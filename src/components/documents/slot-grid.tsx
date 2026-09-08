import Link from "next/link";
import type { SlotView } from "@/lib/queries/slots";
import { formatDate } from "@/lib/format";
import { formatBytes } from "@/lib/storage/config";
import { cn } from "@/lib/utils";
import { SlotUpload } from "./slot-upload";
import { SignatureActions } from "./signature-actions";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { clearSlot, archiveSlot } from "@/lib/actions/slots";

// Chaque emplacement attendu est une carte. On voit d'un coup d'œil ce qui
// manque : une carte en pointillés avec sa pastille rouge veut dire « à toi
// de jouer ». Une carte pleine porte sa pièce.

// Ce qu'on lit sur la carte dépend de ce qu'on attend, pas seulement de son
// contenu : un carré à signer encore vide reste « à signer », pas « à fournir ».
function stateLabel(slot: SlotView): string {
  if (slot.kind === "to_provide") return slot.state === "empty" ? "À fournir" : "Reçu";
  return slot.state === "signed" ? "Signé" : "À signer";
}

export function SlotGrid({
  slots,
  role,
  emptyLabel = "Rien à fournir pour l'instant.",
}: {
  slots: SlotView[];
  /// « holder » : le titulaire agit. « staff » : le formateur suit et gère.
  role: "holder" | "staff";
  emptyLabel?: string;
}) {
  if (slots.length === 0) {
    return <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-foreground-tertiary">{emptyLabel}</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot) => {
        const label = stateLabel(slot);
        const waiting = slot.waitingOnHolder;
        const src = slot.document ? `/api/documents/${slot.document.id}` : null;
        return (
          <li
            key={slot.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-4",
              waiting ? "border-dashed" : "bg-surface/40",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-medium">{slot.title}</p>
              <span
                aria-label={label}
                className={cn(
                  "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                  waiting ? "bg-status-red" : "bg-status-green",
                )}
              />
            </div>

            <p className="text-xs text-foreground-secondary">
              {label}
              {slot.dueDate ? ` · pour le ${formatDate(slot.dueDate)}` : ""}
            </p>
            {slot.instructions ? (
              <p className="text-xs text-foreground-tertiary">{slot.instructions}</p>
            ) : null}

            {slot.document ? (
              <div className="mt-auto space-y-1 border-t pt-2 text-sm">
                <p className="truncate text-xs text-foreground-tertiary">
                  {slot.document.sizeBytes ? formatBytes(slot.document.sizeBytes) : "Pièce déposée"}
                </p>
                <span className="flex flex-wrap items-center gap-3">
                  <Link href={src!} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-2">
                    Ouvrir
                  </Link>
                  <Link href={`${src}?download=1`} className="text-sm text-foreground-secondary underline underline-offset-2 hover:text-foreground">
                    Télécharger
                  </Link>
                </span>
                {slot.kind === "to_sign" ? (
                  <SignatureActions
                    documentId={slot.document.id}
                    status={slot.document.signatureStatus}
                    canRequest={role === "staff"}
                    canSign={role === "holder"}
                  />
                ) : null}
              </div>
            ) : (
              <div className="mt-auto pt-1">
                {/* Le titulaire fournit ; le formateur pose la pièce à signer. */}
                {slot.kind === "to_provide" && (role === "holder" || role === "staff") ? (
                  <SlotUpload slotId={slot.id} label={role === "holder" ? "Déposer ma pièce" : "Déposer à sa place"} />
                ) : null}
                {slot.kind === "to_sign" && role === "staff" ? (
                  <SlotUpload slotId={slot.id} label="Déposer le document à signer" />
                ) : null}
                {slot.kind === "to_sign" && role === "holder" ? (
                  <p className="text-xs text-foreground-tertiary">Votre formateur n&apos;a pas encore déposé le document.</p>
                ) : null}
              </div>
            )}

            {role === "staff" ? (
              <div className="flex flex-wrap gap-1 border-t pt-2">
                {slot.document && slot.document.signatureStatus === "na" ? (
                  <ConfirmButton
                    action={clearSlot.bind(null, slot.id)}
                    title={`Retirer la pièce de « ${slot.title} » ?`}
                    description="L'emplacement redevient vide et la demande tient toujours."
                    confirmLabel="Retirer la pièce"
                    variant="ghost"
                  >
                    Retirer la pièce
                  </ConfirmButton>
                ) : null}
                <ConfirmButton
                  action={archiveSlot.bind(null, slot.id)}
                  title={`Supprimer la demande « ${slot.title} » ?`}
                  description="La demande disparaît. Une pièce déjà déposée reste au dossier."
                  confirmLabel="Supprimer la demande"
                  variant="ghost"
                >
                  Supprimer
                </ConfirmButton>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

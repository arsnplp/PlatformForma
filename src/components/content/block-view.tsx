import Link from "next/link";
import { Prose } from "./prose";
import { readText, readFile, readEmbed, readVisio } from "@/lib/content/block-payload";
import { formatDuration } from "@/lib/content/duration";
import { SeanceCard, type SeanceView } from "./seance-card";
import { formatBytes, documentLabel } from "@/lib/storage/config";
import type { ContentBlockType } from "@/generated/prisma/enums";

export type ViewBlock = { id: string; type: ContentBlockType; payload: unknown };

// Rendu d'un bloc, quel que soit son type. Utilisé par l'éditeur et par
// l'espace élève : ce que voit le formateur est ce que verra l'apprenant.
// Les fichiers passent tous par /api/fichiers/[blockId], qui vérifie les
// droits avant de délivrer une URL signée de 60 secondes.
export function BlockView({ block, seance, now = 0 }: { block: ViewBlock; seance?: SeanceView | null; now?: number }) {
  const src = `/api/fichiers/${block.id}`;

  // Séance de visio : dans une session, elle affiche son horaire, son lien et
  // l'émargement ; hors session (aperçu du modèle), seulement ce qu'elle prévoit.
  if (block.type === "visio") {
    const visio = readVisio(block.payload);
    if (!visio) return <MissingFile label="Séance mal configurée" />;
    if (seance) return <SeanceCard visio={visio} seance={seance} now={now} />;
    return (
      <div className="my-4 rounded-md border border-dashed px-4 py-3">
        <p className="font-medium">{visio.title}</p>
        <p className="text-sm text-foreground-secondary">
          Classe virtuelle · {formatDuration(visio.durationMinutes)} · date et lien définis par session
        </p>
        {visio.note ? <p className="mt-1 text-sm text-foreground-tertiary">{visio.note}</p> : null}
      </div>
    );
  }

  if (block.type === "image") {
    const file = readFile(block.payload);
    if (!file) return <MissingFile />;
    return (
      <figure className="my-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={file.alt || ""} loading="lazy" className="max-w-full rounded-md border" />
        {file.caption ? <figcaption className="mt-2 text-sm text-foreground-tertiary">{file.caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "video") {
    const file = readFile(block.payload);
    if (!file) return <MissingFile />;
    return (
      <figure className="my-4">
        <video src={src} controls preload="metadata" className="w-full rounded-md border">
          Votre navigateur ne peut pas lire cette vidéo.
        </video>
        {file.caption ? <figcaption className="mt-2 text-sm text-foreground-tertiary">{file.caption}</figcaption> : null}
      </figure>
    );
  }

  // PDF et bureautique partagent la même carte. La seule différence : un PDF
  // s'ouvre dans le navigateur, un .docx ne s'affiche pas — on le télécharge.
  if (block.type === "pdf" || block.type === "file") {
    const file = readFile(block.payload);
    if (!file) return <MissingFile />;
    const isPdf = block.type === "pdf";
    return (
      <figure className="my-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate font-medium">{file.name}</span>
            <span className="text-xs text-foreground-tertiary">
              {isPdf ? "PDF" : documentLabel(file.mimeType)} · {formatBytes(file.sizeBytes)}
            </span>
          </span>
          <span className="flex shrink-0 gap-3 text-sm">
            {isPdf ? (
              <Link href={src} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Ouvrir</Link>
            ) : null}
            <Link
              href={`${src}?download=1`}
              className={isPdf ? "text-foreground-secondary underline underline-offset-2 hover:text-foreground" : "underline underline-offset-2"}
            >
              Télécharger
            </Link>
          </span>
        </div>
        {file.caption ? <figcaption className="mt-2 text-sm text-foreground-tertiary">{file.caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "embed") {
    const embed = readEmbed(block.payload);
    if (!embed) return <MissingFile label="Lien vidéo invalide" />;
    return (
      <figure className="my-4">
        <div className="aspect-video w-full overflow-hidden rounded-md border">
          <iframe
            src={embed.embedUrl}
            title={embed.caption || "Vidéo"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full"
          />
        </div>
        {embed.caption ? <figcaption className="mt-2 text-sm text-foreground-tertiary">{embed.caption}</figcaption> : null}
      </figure>
    );
  }

  return <Prose markdown={readText(block.payload)} />;
}

function MissingFile({ label = "Fichier indisponible" }: { label?: string }) {
  return <p className="my-4 rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">{label}</p>;
}

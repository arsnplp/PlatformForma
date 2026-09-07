import Link from "next/link";
import { Prose } from "./prose";
import { readText, readFile, readEmbed } from "@/lib/content/block-payload";
import { formatBytes } from "@/lib/storage/config";
import type { ContentBlockType } from "@/generated/prisma/enums";

export type ViewBlock = { id: string; type: ContentBlockType; payload: unknown };

// Rendu d'un bloc, quel que soit son type. Utilisé par l'éditeur et par
// l'espace élève : ce que voit le formateur est ce que verra l'apprenant.
// Les fichiers passent tous par /api/fichiers/[blockId], qui vérifie les
// droits avant de délivrer une URL signée de 60 secondes.
export function BlockView({ block }: { block: ViewBlock }) {
  const src = `/api/fichiers/${block.id}`;

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

  if (block.type === "pdf") {
    const file = readFile(block.payload);
    if (!file) return <MissingFile />;
    return (
      <figure className="my-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate font-medium">{file.name}</span>
            <span className="text-xs text-foreground-tertiary">PDF · {formatBytes(file.sizeBytes)}</span>
          </span>
          <span className="flex shrink-0 gap-3 text-sm">
            <Link href={src} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Ouvrir</Link>
            <Link href={`${src}?download=1`} className="text-foreground-secondary underline underline-offset-2 hover:text-foreground">Télécharger</Link>
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

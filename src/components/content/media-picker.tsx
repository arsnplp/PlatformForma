"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { requestUpload, attachUploadedFile, addEmbedBlock } from "@/lib/actions/media";
import { CONTENT_BUCKET, MAX_FILE_BYTES, ALLOWED_TYPES, formatBytes } from "@/lib/storage/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/ui/file-dropzone";
import type { BlockTarget } from "@/lib/content/block-target";

const ACCEPT = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.pdf, ...ALLOWED_TYPES.video, ...ALLOWED_TYPES.document].join(",");

// Envoi direct navigateur → Supabase : le fichier ne passe pas par le serveur
// applicatif. L'autorisation est délivrée à l'unité, après vérification des droits.
export function MediaPicker({
  target,
  afterOrder,
  mode,
  onDone,
  onCancel,
}: {
  target: BlockTarget;
  afterOrder: number | null;
  mode: "file" | "embed";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`Fichier trop lourd (${formatBytes(file.size)}), maximum ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setBusy(true);
    setProgress("Préparation…");
    try {
      const ticket = await requestUpload(target, file.name, file.type, file.size);
      if (!ticket.ok) { setError(ticket.error); return; }

      setProgress(`Envoi de ${file.name} (${formatBytes(file.size)})…`);
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { error: upErr } = await supabase.storage
        .from(CONTENT_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (upErr) { setError(`Envoi échoué : ${upErr.message}`); return; }

      setProgress("Ajout du bloc…");
      await attachUploadedFile(target, afterOrder, {
        path: ticket.path, name: file.name, mimeType: file.type, sizeBytes: file.size,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function submitEmbed() {
    setError(null);
    setBusy(true);
    try {
      const result = await addEmbedBlock(target, afterOrder, url);
      if (result?.error) { setError(result.error); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-80 space-y-3 rounded-lg border bg-background p-3 shadow-lg">
      {mode === "file" ? (
        <>
          <div>
            <p className="text-sm font-medium">Ajouter un fichier</p>
            <p className="mt-0.5 text-xs text-foreground-tertiary">
              Image, PDF, Word, Excel, PowerPoint ou vidéo · {formatBytes(MAX_FILE_BYTES)} maximum. Pour une vidéo lourde, préférez un lien YouTube ou Vimeo.
            </p>
          </div>
          <FileDropzone
            onFile={upload}
            accept={ACCEPT}
            label="Glisse un fichier ici, ou clique pour le choisir"
            busy={busy}
            className="py-4"
          />
        </>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium">Intégrer une vidéo</p>
            <p className="mt-0.5 text-xs text-foreground-tertiary">Collez un lien YouTube ou Vimeo.</p>
          </div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitEmbed(); } }}
          />
          <Button type="button" size="sm" onClick={submitEmbed} disabled={busy || !url.trim()}>
            {busy ? "Ajout…" : "Ajouter"}
          </Button>
        </>
      )}

      {progress ? <p className="text-xs text-foreground-secondary">{progress}</p> : null}
      {error ? <p className="text-xs text-status-red">{error}</p> : null}
      <button type="button" onClick={onCancel} className="text-xs text-foreground-tertiary hover:text-foreground">
        Annuler
      </button>
    </div>
  );
}

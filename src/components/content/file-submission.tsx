"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { requestSubmissionUpload, submitFiles } from "@/lib/actions/submissions";
import { MAX_FILE_BYTES, SUBMISSION_TYPES, formatBytes } from "@/lib/storage/config";
import { Button } from "@/components/ui/button";

type Ready = { path: string; name: string; mimeType: string; sizeBytes: number };

// Dépôt d'un livrable par l'élève : envoi direct vers le stockage, puis
// enregistrement de la soumission. Le livrable n'est visible que de l'élève
// et du formateur de la session.
export function FileSubmission({
  exerciseId,
  sessionId,
  maxFiles,
  guidance,
}: {
  exerciseId: string;
  sessionId: string;
  maxFiles: number;
  guidance: string;
}) {
  const [files, setFiles] = useState<Ready[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);
    if (files.length >= maxFiles) { setError(`Au maximum ${maxFiles} fichier(s).`); return; }
    if (file.size > MAX_FILE_BYTES) { setError(`Fichier trop lourd (${formatBytes(file.size)}).`); return; }
    setBusy(true);
    setProgress(`Envoi de ${file.name}…`);
    try {
      const ticket = await requestSubmissionUpload(exerciseId, sessionId, file.name, file.type, file.size);
      if (!ticket.ok) { setError(ticket.error); return; }
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const { error: upErr } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (upErr) { setError(`Envoi échoué : ${upErr.message}`); return; }
      setFiles((f) => [...f, { path: ticket.path, name: file.name, mimeType: file.type, sizeBytes: file.size }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function send() {
    startTransition(async () => {
      const result = await submitFiles(exerciseId, sessionId, files);
      if (result?.error) { setError(result.error); setConfirming(false); }
    });
  }

  return (
    <div className="space-y-3">
      {guidance ? <p className="text-sm text-foreground-secondary">{guidance}</p> : null}

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{f.name} <span className="text-xs text-foreground-tertiary">· {formatBytes(f.sizeBytes)}</span></span>
              <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => setFiles(files.filter((_, j) => j !== i))} disabled={pending}>Retirer</Button>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length < maxFiles && !confirming ? (
        <input
          type="file"
          accept={SUBMISSION_TYPES.join(",")}
          disabled={busy || pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          className="block w-full max-w-sm text-xs file:mr-2 file:rounded-md file:border file:bg-surface file:px-2 file:py-1 file:text-xs"
          aria-label="Choisir un fichier"
        />
      ) : null}

      {progress ? <p className="text-xs text-foreground-secondary">{progress}</p> : null}
      {error ? <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">{error}</p> : null}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
          <p className="text-sm">Rendre ce livrable ? <span className="text-foreground-secondary">C&apos;est définitif.</span></p>
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>Annuler</Button>
            <Button type="button" size="sm" onClick={send} disabled={pending}>{pending ? "Envoi…" : "Confirmer"}</Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setConfirming(true)} disabled={files.length === 0 || busy}>Rendre le livrable</Button>
          <span className="text-xs text-foreground-tertiary">
            {files.length} / {maxFiles} fichier(s) · {formatBytes(MAX_FILE_BYTES)} max · corrigé par votre formateur
          </span>
        </div>
      )}
    </div>
  );
}

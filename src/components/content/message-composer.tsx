"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { sendMessage, requestMessageUpload } from "@/lib/actions/conversations";
import type { MessageFile } from "@/lib/content/message-payload";
import { MESSAGE_BUCKET, MESSAGE_TYPES, MAX_FILE_BYTES, formatBytes } from "@/lib/storage/config";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_FILES = 5;

// Zone d'envoi d'un message. Le corps accepte le Markdown, comme le reste,
// et l'on peut y joindre des pièces — l'un, l'autre, ou les deux.
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<MessageFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  // La pièce part directement au stockage privé ; le message n'est créé
  // qu'à l'envoi, avec la liste de ce qui a bien été déposé.
  async function attach(file: File) {
    setError(null);
    if (files.length >= MAX_FILES) { setError(`${MAX_FILES} pièces jointes au maximum.`); return; }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Fichier trop lourd (${formatBytes(file.size)}), maximum ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      const ticket = await requestMessageUpload(conversationId, file.name, file.type, file.size);
      if (!ticket.ok) { setError(ticket.error); return; }

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { error: upErr } = await supabase.storage
        .from(MESSAGE_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (upErr) { setError(`Envoi échoué : ${upErr.message}`); return; }

      setFiles((current) => [...current, { path: ticket.path, name: file.name, mimeType: file.type, sizeBytes: file.size }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  function send() {
    if (!body.trim() && files.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(conversationId, body, files);
      if (result?.error) { setError(result.error); return; }
      setBody("");
      setFiles([]);
      router.refresh();
    });
  }

  const empty = !body.trim() && files.length === 0;

  return (
    <div
      className={cn("space-y-2 rounded-lg border p-3 transition-colors", dragging && "border-brand bg-brand-soft")}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        for (const file of Array.from(e.dataTransfer.files).slice(0, MAX_FILES)) attach(file);
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Écrire un message…"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
      />

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={f.path} className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{f.name}</span>
                <span className="text-xs text-foreground-tertiary">{formatBytes(f.sizeBytes)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0"
                onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground-tertiary">
          Markdown accepté · ⌘+Entrée pour envoyer · glissez un fichier pour le joindre
        </p>
        <span className="flex items-center gap-2">
          {/* Un label plutôt qu'un bouton : le clic ouvre le sélecteur, et le
              glisser-déposer sur la zone reste une seconde voie. */}
          <label
            htmlFor={inputId}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm transition-colors hover:bg-surface",
              (busy || files.length >= MAX_FILES) && "pointer-events-none opacity-60",
            )}
          >
            {busy ? "Envoi…" : "Joindre un fichier"}
            <input
              id={inputId}
              type="file"
              accept={MESSAGE_TYPES.join(",")}
              disabled={busy || files.length >= MAX_FILES}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }}
              className="sr-only"
            />
          </label>
          <Button type="button" size="sm" onClick={send} disabled={pending || busy || empty}>
            {pending ? "Envoi…" : "Envoyer"}
          </Button>
        </span>
      </div>
    </div>
  );
}

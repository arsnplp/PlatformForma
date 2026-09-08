"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { requestSlotUpload, fillSlot } from "@/lib/actions/slots";
import { DOCUMENT_TYPES as MIME_TYPES, MAX_FILE_BYTES, formatBytes } from "@/lib/storage/config";
import { cn } from "@/lib/utils";

// Dépôt dans un carré : glisser le fichier, ou cliquer. Le fichier part
// directement au stockage privé, puis le serveur crée la pièce et la rattache.
export function SlotUpload({ slotId, label }: { slotId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`Fichier trop lourd (${formatBytes(file.size)}), maximum ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      const ticket = await requestSlotUpload(slotId, file.name, file.type, file.size);
      if (!ticket.ok) { setError(ticket.error); return; }

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const { error: upErr } = await supabase.storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (upErr) { setError(`Envoi échoué : ${upErr.message}`); return; }

      const result = await fillSlot(slotId, { path: ticket.path, mimeType: file.type, sizeBytes: file.size });
      if (result?.error) { setError(result.error); return; }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-md border border-dashed px-3 py-2 text-center text-sm transition-colors",
          dragging ? "border-brand bg-brand-soft" : "hover:bg-surface",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {busy ? "Envoi en cours…" : label}
        <input
          id={inputId}
          type="file"
          accept={MIME_TYPES.join(",")}
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          className="sr-only"
        />
      </label>
      {error ? <p className="mt-1 text-xs text-status-red">{error}</p> : null}
    </>
  );
}

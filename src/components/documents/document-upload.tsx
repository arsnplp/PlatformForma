"use client";

import { useId, useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { requestDocumentUpload, createDocument, type DocumentTargetInput } from "@/lib/actions/documents";
import { MAX_FILE_BYTES, DOCUMENT_TYPES as MIME_TYPES, formatBytes } from "@/lib/storage/config";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/admin/native-select";
import { FormField } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";

// Dépôt d'une pièce au dossier : envoi direct vers le stockage privé, puis
// enregistrement. Le titulaire (élève ou entreprise) est fixé par l'appelant,
// jamais choisi ici : c'est lui qui décide dans quel dossier on classe.
export function DocumentUpload({
  target,
  label = "Déposer une pièce",
  sessions,
}: {
  target: Omit<DocumentTargetInput, "type" | "phase" | "title">;
  label?: string;
  /// Quand la pièce peut aller dans plusieurs sessions du même titulaire,
  /// c'est ici qu'on choisit laquelle : une pièce sans session ne serait
  /// rattachable à aucun dossier de preuve.
  sessions?: { id: string; name: string }[];
}) {
  const [title, setTitle] = useState("");
  const [sessionId, setSessionId] = useState(sessions?.[0]?.id ?? target.sessionId ?? null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);
    setDone(null);
    if (file.size > MAX_FILE_BYTES) { setError(`Fichier trop lourd (${formatBytes(file.size)}).`); return; }

    const full: DocumentTargetInput = { ...target, sessionId, title: title.trim() || file.name };
    setBusy(true);
    try {
      const ticket = await requestDocumentUpload(full, file.name, file.type, file.size);
      if (!ticket.ok) { setError(ticket.error); return; }

      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const { error: upErr } = await supabase.storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (upErr) { setError(`Envoi échoué : ${upErr.message}`); return; }

      startTransition(async () => {
        const result = await createDocument(full, { path: ticket.path, mimeType: file.type, sizeBytes: file.size });
        if (result?.error) setError(result.error);
        else { setDone(full.title); setTitle(""); }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="font-medium">{label}</p>

      {sessions && sessions.length > 1 ? (
        <FormField id="doc-session" label="Session">
          <NativeSelect id="doc-session" value={sessionId ?? ""} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </FormField>
      ) : null}

      <FormField id="doc-title" label="Intitulé">
        <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom du fichier si vide" />
      </FormField>

      {/* Deux façons de déposer : glisser le fichier, ou cliquer pour l'ouvrir
          depuis le disque. Le glisser-déposer évite le sélecteur du système,
          qui reste bloqué dans certains navigateurs (fenêtre automatisée). */}
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
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-brand bg-brand-soft" : "hover:bg-surface",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-sm font-medium">
          {busy ? "Envoi en cours…" : "Glisse un fichier ici, ou clique pour le choisir"}
        </span>
        <span className="text-xs text-foreground-tertiary">
          PDF, images, bureautique et texte · {formatBytes(MAX_FILE_BYTES)} maximum
        </span>
        <input
          id={inputId}
          type="file"
          accept={MIME_TYPES.join(",")}
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          className="sr-only"
        />
      </label>

      <p className="text-xs text-foreground-tertiary">
        La pièce n&apos;est jamais publique : chaque ouverture passe par un lien signé de courte durée.
      </p>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      {done ? <p className="text-sm text-status-green">« {done} » déposée.</p> : null}
    </div>
  );
}

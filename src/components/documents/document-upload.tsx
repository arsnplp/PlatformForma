"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { requestDocumentUpload, createDocument, type DocumentTarget } from "@/lib/actions/documents";
import { MAX_FILE_BYTES, DOCUMENT_TYPES as MIME_TYPES, formatBytes } from "@/lib/storage/config";
import { DOCUMENT_TYPES, PHASES } from "@/lib/labels";
import type { DocumentType } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/admin/native-select";
import { FormField } from "@/components/admin/form-field";

// Dépôt d'une pièce au dossier : envoi direct vers le stockage privé, puis
// enregistrement. Le titulaire (élève ou entreprise) est fixé par l'appelant,
// jamais choisi ici : c'est lui qui décide dans quel dossier on classe.
export function DocumentUpload({
  target,
  label = "Déposer une pièce",
  sessions,
}: {
  target: Omit<DocumentTarget, "type" | "phase" | "title">;
  label?: string;
  /// Quand la pièce peut aller dans plusieurs sessions du même titulaire,
  /// c'est ici qu'on choisit laquelle : une pièce sans session ne serait
  /// rattachable à aucun dossier de preuve.
  sessions?: { id: string; name: string }[];
}) {
  const [type, setType] = useState<DocumentType>("contrat");
  const [phase, setPhase] = useState<number>(DOCUMENT_TYPES.contrat.phase);
  const [title, setTitle] = useState("");
  const [sessionId, setSessionId] = useState(sessions?.[0]?.id ?? target.sessionId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function changeType(value: DocumentType) {
    setType(value);
    setPhase(DOCUMENT_TYPES[value].phase);
  }

  async function upload(file: File) {
    setError(null);
    setDone(null);
    if (file.size > MAX_FILE_BYTES) { setError(`Fichier trop lourd (${formatBytes(file.size)}).`); return; }

    const full: DocumentTarget = { ...target, sessionId, type, phase, title: title.trim() || file.name };
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

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="doc-type" label="Type">
          <NativeSelect id="doc-type" value={type} onChange={(e) => changeType(e.target.value as DocumentType)}>
            {Object.entries(DOCUMENT_TYPES).map(([key, v]) => (
              <option key={key} value={key}>{v.label}</option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="doc-phase" label="Phase">
          <NativeSelect id="doc-phase" value={String(phase)} onChange={(e) => setPhase(Number(e.target.value))}>
            {PHASES.map((p) => <option key={p.n} value={p.n}>P{p.n} · {p.label}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="doc-title" label="Intitulé">
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom du fichier si vide" />
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept={MIME_TYPES.join(",")}
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        {busy ? <span className="text-sm text-foreground-secondary">Envoi…</span> : null}
      </div>

      <p className="text-xs text-foreground-tertiary">
        PDF, images et bureautique · {formatBytes(MAX_FILE_BYTES)} maximum. La pièce n&apos;est jamais publique :
        chaque ouverture passe par un lien signé de courte durée.
      </p>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      {done ? <p className="text-sm text-status-green">« {done} » déposée.</p> : null}
    </div>
  );
}

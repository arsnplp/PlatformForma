"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { saveIntroText } from "@/lib/actions/intro";
import { requestUpload, attachUploadedFile, removeMediaBlock } from "@/lib/actions/media";
import { CONTENT_BUCKET, MAX_FILE_BYTES, ALLOWED_TYPES, formatBytes } from "@/lib/storage/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPT = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.pdf, ...ALLOWED_TYPES.video, ...ALLOWED_TYPES.document].join(",");

// Introduction : deux gestes indépendants, jamais imposés ensemble.
//   • écrire directement dans la zone de texte ;
//   • déposer des fichiers à côté (glisser, ou cliquer).
// L'un, l'autre, ou les deux.
export function IntroEditor({
  versionId,
  initialText,
  files,
}: {
  versionId: string;
  initialText: string;
  /// Fichiers déjà déposés, rendus côté serveur pour un aperçu fidèle.
  files: { id: string; view: ReactNode }[];
}) {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const router = useRouter();

  // La zone grandit avec le texte : pas d'ascenseur dans un mot d'accueil.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [text]);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveIntroText(versionId, text);
      if (result?.error) { setError(result.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`Fichier trop lourd (${formatBytes(file.size)}), maximum ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setBusy(true);
    setProgress("Préparation…");
    try {
      const target = { formationVersionId: versionId } as const;
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

      setProgress("Enregistrement…");
      await attachUploadedFile(target, null, {
        path: ticket.path, name: file.name, mimeType: file.type, sizeBytes: file.size,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setSaved(false); }}
          onBlur={() => { if (!saved) save(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }}
          placeholder="Écris ici le mot d'accueil et le déroulé : jour 1, jour 2…"
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-foreground-tertiary">
            Markdown accepté · ⌘+Entrée pour enregistrer
            {saved ? "" : " · modifications non enregistrées"}
          </p>
          <Button type="button" size="sm" className="h-7" onClick={save} disabled={pending || saved}>
            {pending ? "Enregistrement…" : saved ? "Enregistré" : "Enregistrer"}
          </Button>
        </div>
      </div>

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="group relative">
              {f.view}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 px-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                onClick={() => startTransition(async () => { await removeMediaBlock(f.id); router.refresh(); })}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Glisser OU cliquer : le sélecteur système reste bloqué dans certaines
          fenêtres automatisées, le glisser-déposer donne toujours une issue. */}
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
          "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed px-4 py-4 text-center transition-colors",
          dragging ? "border-brand bg-brand-soft" : "hover:bg-surface",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-sm">
          {busy ? progress ?? "Envoi en cours…" : "Glisse un fichier ici, ou clique pour le choisir"}
        </span>
        <span className="text-xs text-foreground-tertiary">
          Plan de formation, PDF, Word, image, vidéo · {formatBytes(MAX_FILE_BYTES)} maximum
        </span>
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          className="sr-only"
        />
      </label>

      {error ? <p className="text-xs text-status-red">{error}</p> : null}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

// Zone de dépôt : glisser un fichier, OU cliquer pour l'ouvrir depuis le
// disque. Les deux voies mènent au même endroit, et il en faut deux — le
// sélecteur du système reste bloqué dans certaines fenêtres (navigateur
// automatisé, kiosque), et le glisser-déposer est impossible au clavier.
export function FileDropzone({
  onFile,
  accept,
  label,
  hint,
  busy = false,
  disabled = false,
  className,
}: {
  onFile: (file: File) => void;
  accept: string;
  label: string;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const locked = busy || disabled;

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => { e.preventDefault(); if (!locked) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (locked) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
        dragging ? "border-brand bg-brand-soft" : "hover:bg-surface",
        locked && "pointer-events-none opacity-60",
        className,
      )}
    >
      <span className="text-sm font-medium">{busy ? "Envoi en cours…" : label}</span>
      {hint ? <span className="text-xs text-foreground-tertiary">{hint}</span> : null}
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={locked}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
        className="sr-only"
      />
    </label>
  );
}

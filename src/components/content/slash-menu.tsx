"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_CHOICES, type BlockChoice } from "@/lib/content/block-types";
import { cn } from "@/lib/utils";

// Menu « / » : liste filtrable des types de blocs, navigable au clavier.
export function SlashMenu({
  onPick,
  onClose,
  anchorLabel = "Ajouter un bloc",
}: {
  onPick: (choice: BlockChoice) => void;
  onClose: () => void;
  anchorLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BLOCK_CHOICES;
    return BLOCK_CHOICES.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q)),
    );
  }, [query]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // L'index actif suit la recherche sans passer par un effet.
  function onQueryChange(value: string) {
    setQuery(value);
    setActive(0);
  }

  // Fermeture au clic extérieur.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div ref={boxRef} className="absolute z-20 w-72 overflow-hidden rounded-lg border bg-background shadow-lg">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={anchorLabel}
        aria-label={anchorLabel}
        className="w-full border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground-tertiary"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (results[active]) onPick(results[active]); }
          else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      />
      <ul className="max-h-72 overflow-y-auto py-1">
        {results.length === 0 ? (
          <li className="px-3 py-2 text-sm text-foreground-tertiary">Aucun type ne correspond</li>
        ) : (
          results.map((c, i) => (
            <li key={c.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(c)}
                className={cn(
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm",
                  i === active ? "bg-surface-hover" : "hover:bg-surface",
                )}
              >
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-foreground-tertiary">{c.hint}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

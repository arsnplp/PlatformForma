"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addBlock, updateBlock, duplicateBlock, removeBlock, reorderBlocks } from "@/lib/actions/blocks";
import type { BlockChoice } from "@/lib/content/block-types";
import { SlashMenu } from "./slash-menu";
import { MediaPicker } from "./media-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EditorBlock = {
  id: string;
  order: number;
  /// Vide pour un bloc média : seul le rendu serveur est affiché.
  markdown: string;
  isText: boolean;
};

// Zone « + Ajouter un bloc » entre deux blocs : révélée au survol, ouvre le menu « / ».
function AddZone({
  open,
  onToggle,
  onPick,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onPick: (choice: BlockChoice) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <div className="group flex h-6 items-center justify-center">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-foreground-secondary">
            + Ajouter un bloc
          </span>
          <span className="h-px flex-1 bg-border" />
        </button>
      </div>
      {open ? (
        <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2">
          <SlashMenu onPick={onPick} onClose={onClose} />
        </div>
      ) : null}
    </div>
  );
}

// Éditeur de blocs (spec §3.2 / §5.4).
// Lecture : le HTML vient du serveur, donc identique au rendu élève.
// Édition : on bascule un bloc en zone de texte Markdown ; à la sauvegarde,
// le serveur re-rend le bloc. Un bloc = une ligne en base, réordonnable.
export function BlockEditor({
  lessonId,
  blocks,
  rendered,
}: {
  lessonId: string;
  blocks: EditorBlock[];
  /// Rendu de chaque bloc, calculé par le serveur : l'aperçu est exactement
  /// ce que verra l'élève, médias compris.
  rendered: Record<string, ReactNode>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menuAfter, setMenuAfter] = useState<number | "end" | null>(null);
  const [mediaAfter, setMediaAfter] = useState<{ position: number | "end"; afterOrder: number | null; mode: "file" | "embed" } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const justCreated = useRef<string | null>(null);

  // Redimensionne la zone de saisie à son contenu.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editingId]);

  // Ouvre en édition le bloc qui vient d'être créé.
  useEffect(() => {
    if (!justCreated.current) return;
    const block = blocks.find((b) => b.id === justCreated.current);
    if (block) {
      justCreated.current = null;
      setEditingId(block.id);
      setDraft(block.markdown);
    }
  }, [blocks]);

  function startEditing(block: EditorBlock) {
    setEditingId(block.id);
    setDraft(block.markdown);
    setError(null);
  }

  function save(blockId: string, markdown: string, then?: () => void) {
    startTransition(async () => {
      const result = await updateBlock(blockId, markdown);
      if (result?.error) { setError(result.error); return; }
      setEditingId(null);
      then?.();
    });
  }

  function insert(choice: BlockChoice, afterOrder: number | null, position: number | "end") {
    // Bloc média : on ouvre le sélecteur plutôt que d'insérer du Markdown.
    if (choice.media) {
      setMenuAfter(null);
      setMediaAfter({ position, afterOrder, mode: choice.media });
      return;
    }
    const markdown = choice.template.replace("|", "");
    startTransition(async () => {
      const { id } = await addBlock(lessonId, afterOrder, markdown);
      justCreated.current = id;
      setMenuAfter(null);
    });
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = blocks.map((b) => b.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    setOverId(null);
    startTransition(async () => { await reorderBlocks(lessonId, ids); });
  }

  return (
    <div className={cn("space-y-1", pending && "opacity-70")}>
      {error ? <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">{error}</p> : null}

      {mediaAfter ? (
        <div className="flex justify-center py-2">
          <MediaPicker
            lessonId={lessonId}
            afterOrder={mediaAfter.afterOrder}
            mode={mediaAfter.mode}
            onDone={() => { setMediaAfter(null); router.refresh(); }}
            onCancel={() => setMediaAfter(null)}
          />
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <p className="text-sm text-foreground-secondary">Cette leçon est vide.</p>
          <div className="mt-3 inline-block">
            <Button type="button" variant="outline" size="sm" onClick={() => setMenuAfter("end")}>
              Ajouter un premier bloc
            </Button>
            {menuAfter === "end" ? (
              <div className="relative">
                <div className="absolute left-1/2 top-2 -translate-x-1/2">
                  <SlashMenu onPick={(c) => insert(c, null, "end")} onClose={() => setMenuAfter(null)} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <AddZone
          open={menuAfter === -1}
          onToggle={() => setMenuAfter(menuAfter === -1 ? null : -1)}
          onPick={(c) => insert(c, null, -1)}
          onClose={() => setMenuAfter(null)}
        />
      )}

      {blocks.map((block, index) => {
        const isEditing = editingId === block.id;
        return (
          <div key={block.id}>
            <div
              draggable={!isEditing}
              onDragStart={() => setDragId(block.id)}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); setOverId(block.id); }}
              onDrop={(e) => { e.preventDefault(); onDrop(block.id); }}
              className={cn(
                "group relative rounded-md border border-transparent transition-colors",
                !isEditing && "hover:border-border hover:bg-surface/40",
                overId === block.id && dragId !== block.id && "border-brand",
                dragId === block.id && "opacity-40",
              )}
            >
              {/* Barre d'outils du bloc, visible au survol */}
              {!isEditing ? (
                <div className="absolute -left-1 top-1 z-10 flex -translate-x-full items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <span className="cursor-grab select-none px-1 text-foreground-tertiary" title="Glisser pour déplacer" aria-hidden>⠿</span>
                </div>
              ) : null}

              {isEditing && block.isText ? (
                <div className="space-y-2 rounded-md border bg-background p-2">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(block.id, draft); }
                    }}
                    rows={3}
                    autoFocus
                    className="w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed outline-none"
                    placeholder="Écris en Markdown…"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-foreground-tertiary">Markdown · ⌘+Entrée pour enregistrer, Échap pour annuler</p>
                    <span className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditingId(null)}>Annuler</Button>
                      <Button type="button" size="sm" className="h-7" onClick={() => save(block.id, draft)} disabled={pending}>Enregistrer</Button>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {block.isText ? (
                    <button
                      type="button"
                      onClick={() => startEditing(block)}
                      className="block w-full cursor-text px-2 py-1 text-left"
                      aria-label={`Modifier le bloc ${index + 1}`}
                    >
                      {block.markdown.trim() ? (
                        rendered[block.id]
                      ) : (
                        <span className="text-sm text-foreground-tertiary">Bloc vide — cliquer pour écrire</span>
                      )}
                    </button>
                  ) : (
                    <div className="px-2 py-1">{rendered[block.id]}</div>
                  )}
                  {/* Actions flottantes : elles ne réduisent jamais la largeur du contenu,
                      pour que l'aperçu soit à la largeur réelle de lecture de l'élève. */}
                  <span className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-md border bg-background/95 px-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {block.isText ? (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => startEditing(block)}>Modifier</Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => startTransition(async () => { await duplicateBlock(block.id); })}>Dupliquer</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-foreground-tertiary" onClick={() => startTransition(async () => { await removeBlock(block.id); })}>Retirer</Button>
                  </span>
                </div>
              )}
            </div>
            <AddZone
              open={menuAfter === index}
              onToggle={() => setMenuAfter(menuAfter === index ? null : index)}
              onPick={(c) => insert(c, block.order, index)}
              onClose={() => setMenuAfter(null)}
            />
          </div>
        );
      })}
    </div>
  );
}

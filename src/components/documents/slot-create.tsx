"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSlot, type SlotHolder } from "@/lib/actions/slots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";

// Ouvrir un emplacement : soit on demande une pièce (le carré naît vide), soit
// on en pose une à signer. Deux gestes distincts, choisis avant de nommer.
export function SlotCreate({ holder }: { holder: SlotHolder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"to_provide" | "to_sign">("to_provide");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createSlot(holder, {
        kind,
        title,
        instructions: instructions.trim() || undefined,
        dueDate: dueDate || undefined,
      });
      if (result?.error) { setError(result.error); return; }
      setTitle("");
      setInstructions("");
      setDueDate("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Demander un document
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap gap-1 rounded-md bg-surface p-0.5 w-fit">
        {([
          ["to_provide", "Il fournit une pièce"],
          ["to_sign", "Il signe une pièce"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              kind === value ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <FormField id="slot-title" label="Nom du document">
        <Input
          id="slot-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "to_provide" ? "Carte d'identité" : "Contrat de formation"}
          autoFocus
        />
      </FormField>

      <FormField id="slot-instructions" label="Précisions (facultatif)">
        <Input
          id="slot-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Recto-verso, lisible"
        />
      </FormField>

      <FormField id="slot-due" label="Pour le (facultatif)">
        <Input id="slot-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-48" />
      </FormField>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={pending || !title.trim()}>
          {pending ? "Création…" : kind === "to_provide" ? "Demander cette pièce" : "Créer l'emplacement à signer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Annuler</Button>
      </div>
      <p className="text-xs text-foreground-tertiary">
        {kind === "to_provide"
          ? "Un emplacement vide apparaît chez l'élève, marqué à fournir."
          : "Vous déposerez ensuite le document ; la demande de signature part aussitôt."}
      </p>
    </div>
  );
}

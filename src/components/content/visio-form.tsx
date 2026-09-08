"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addVisioBlock, updateVisioBlock } from "@/lib/actions/blocks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/admin/form-field";

// Le bloc visio décrit la SÉANCE : son intitulé et sa durée. La date et le lien
// se renseignent sur chaque session, puisqu'une même version sert plusieurs
// sessions avec des calendriers différents.
export function VisioForm({
  lessonId,
  afterOrder,
  blockId,
  initial,
  onDone,
  onCancel,
}: {
  lessonId?: string;
  afterOrder?: number | null;
  blockId?: string;
  initial?: { title: string; durationMinutes: number; note?: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 120));
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const input = { title, durationMinutes: Number(duration), note: note.trim() || undefined };
      const result = blockId
        ? await updateVisioBlock(blockId, input)
        : await addVisioBlock(lessonId!, afterOrder ?? null, input);
      if (result && "error" in result && result.error) { setError(result.error); return; }
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="w-full max-w-lg space-y-3 rounded-lg border bg-background p-4 shadow-sm">
      <p className="font-medium">Séance en classe virtuelle</p>
      <p className="-mt-2 text-sm text-foreground-secondary">
        Chaque séance devient une feuille d&apos;émargement : les élèves signent leur présence.
        La date et le lien se renseignent sur la fiche de chaque session.
      </p>

      <FormField id="visio-title" label="Intitulé de la séance">
        <Input id="visio-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Classe virtuelle 1 — prise en main" autoFocus />
      </FormField>
      <FormField id="visio-duration" label="Durée (minutes)">
        <Input id="visio-duration" type="number" min={5} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} className="w-32" />
      </FormField>
      <FormField id="visio-note" label="Note pour l'élève (facultatif)">
        <Input id="visio-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Prévoir micro et caméra" />
      </FormField>

      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending || !title.trim()}>
          {pending ? "…" : blockId ? "Enregistrer" : "Ajouter la séance"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

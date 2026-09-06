"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/shared";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { NativeSelect } from "@/components/admin/native-select";

export type ProcessSource = { id: string; label: string; versions: { id: string; label: string }[] };

// Bibliothèque de process : copier celui d'une autre formation ou version
// vers ce brouillon (spec §6.4 : monter un nouveau secteur en quelques clics).
export function CopyProcessForm({
  action,
  sources,
  hasSteps,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  sources: ProcessSource[];
  hasSteps: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [formationId, setFormationId] = useState("");
  const [open, setOpen] = useState(false);
  const formation = sources.find((f) => f.id === formationId);

  if (sources.length === 0) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-foreground-secondary underline-offset-2 hover:text-foreground hover:underline">
        Copier le process d&apos;une autre formation…
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Copier un process existant</p>
        <p className="text-sm text-foreground-secondary">
          Reprend toutes les étapes d&apos;une autre formation ou version. Les étapes assignées à son propriétaire seront réassignées au propriétaire de cette formation.
        </p>
      </div>
      <FormError message={state?.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="src-formation" label="Formation source">
          <NativeSelect id="src-formation" value={formationId} onChange={(e) => setFormationId(e.target.value)} required>
            <option value="" disabled>Choisir…</option>
            {sources.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="sourceVersionId" label="Version source" errors={state?.fieldErrors?.sourceVersionId}>
          <NativeSelect id="sourceVersionId" name="sourceVersionId" required disabled={!formation} defaultValue="">
            {!formation ? <option value="">—</option> : null}
            {formation?.versions.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      {hasSteps ? (
        <FormField id="mode" label="Étapes déjà présentes" hint="Ce brouillon contient déjà des étapes.">
          <NativeSelect id="mode" name="mode" defaultValue="replace">
            <option value="replace">Remplacer les étapes actuelles</option>
            <option value="append">Ajouter à la suite</option>
          </NativeSelect>
        </FormField>
      ) : (
        <input type="hidden" name="mode" value="append" />
      )}

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Copie…">Copier le process</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-foreground-secondary hover:text-foreground">Annuler</button>
      </div>
    </form>
  );
}

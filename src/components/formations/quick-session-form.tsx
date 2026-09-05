"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/shared";
import { Input } from "@/components/ui/input";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";

// Session minimale (sous-étape b) : rattachée à la version active au moment de la création.
export function QuickSessionForm({
  action,
  activeVersionNumber,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  activeVersionNumber: number | null;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (k: string) => state?.values?.[k] ?? "";

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Nouvelle session</p>
        <p className="text-sm text-foreground-secondary">
          {activeVersionNumber
            ? `Sera rattachée à la v${activeVersionNumber} (version active) et y restera, quelles que soient les versions publiées ensuite.`
            : "Publie d'abord une version : une session pointe toujours vers une version active."}
        </p>
      </div>
      <FormError message={state?.error} />
      <FormField id="s-name" label="Nom" errors={e.name}>
        <Input id="s-name" name="name" defaultValue={v("name")} placeholder="Session mars 2027" required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="s-start" label="Début" errors={e.startDate}>
          <Input id="s-start" name="startDate" type="date" defaultValue={v("startDate")} required />
        </FormField>
        <FormField id="s-end" label="Fin" errors={e.endDate}>
          <Input id="s-end" name="endDate" type="date" defaultValue={v("endDate")} required />
        </FormField>
      </div>
      <SubmitButton pendingLabel="Création…">Créer la session</SubmitButton>
    </form>
  );
}

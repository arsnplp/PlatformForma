"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/shared";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";

// Crée une nouvelle version brouillon (copie de la dernière) avec un changelog obligatoire.
export function NewVersionForm({
  action,
  nextNumber,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  nextNumber: number;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Nouvelle version (v{nextNumber})</p>
        <p className="text-sm text-foreground-secondary">
          Repart du contenu de la dernière version. Les versions publiées et leurs sessions ne changent pas.
        </p>
      </div>
      <FormError message={state?.error} />
      <FormField id="changelog" label="Changelog" hint="Ce qui change par rapport à la version précédente (utile pour l'audit)" errors={state?.fieldErrors?.changelog}>
        <Textarea id="changelog" name="changelog" rows={2} defaultValue={state?.values?.changelog ?? ""} placeholder="v2 : ajout du module RGPD, retrait de l'exercice 3" required />
      </FormField>
      <SubmitButton pendingLabel="Création…">Créer le brouillon v{nextNumber}</SubmitButton>
    </form>
  );
}

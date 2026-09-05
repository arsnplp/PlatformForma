"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/actions/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";

export type FormationFormValues = { name: string; sector: string | null; description: string | null };

// Identité d'une formation (non versionnée). Le contenu vit dans les versions.
export function FormationForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: FormationFormValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (key: keyof FormationFormValues) => state?.values?.[key] ?? initial?.[key] ?? "";

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormError message={state?.error} />
      <FormField id="name" label="Nom" errors={e.name}>
        <Input id="name" name="name" defaultValue={v("name")} required autoFocus placeholder="Formation IA — BTP" />
      </FormField>
      <FormField id="sector" label="Secteur" hint="Sert au filtrage et à la duplication par secteur" errors={e.sector}>
        <Input id="sector" name="sector" defaultValue={v("sector")} placeholder="BTP, santé, retail…" />
      </FormField>
      <FormField id="description" label="Description" errors={e.description}>
        <Textarea id="description" name="description" rows={4} defaultValue={v("description")} />
      </FormField>
      <div className="flex items-center gap-2 pt-2">
        <SubmitButton>{initial ? "Enregistrer" : "Créer la formation"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Annuler</Link>
        </Button>
      </div>
    </form>
  );
}

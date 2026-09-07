"use client";

import { useActionState } from "react";
import { setMyPassword } from "@/lib/actions/activation";
import { Input } from "@/components/ui/input";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";

export function ActivationForm() {
  const [state, formAction] = useActionState(setMyPassword, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state?.error} />
      <FormField id="password" label="Votre mot de passe">
        <Input id="password" name="password" type="password" autoComplete="new-password" autoFocus required />
      </FormField>
      <FormField id="confirmation" label="Confirmation">
        <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required />
      </FormField>
      <p className="text-xs text-foreground-tertiary">10 caractères minimum. Choisissez-en un que vous n&apos;utilisez nulle part ailleurs.</p>
      <SubmitButton pendingLabel="Enregistrement…">Activer mon compte</SubmitButton>
    </form>
  );
}

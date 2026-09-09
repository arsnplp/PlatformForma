"use client";

import { useActionState, useState } from "react";
import { createTrainer, type AccountState } from "@/lib/actions/users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "./form-field";
import { SubmitButton } from "./submit-button";
import { PasswordField } from "./password-field";

// Création d'un compte formateur. Le mot de passe est posé ici : aucun mail
// ne part, c'est le créateur qui transmet les identifiants.
export function CreateTrainerForm() {
  const [state, formAction] = useActionState<AccountState, FormData>(createTrainer, undefined);
  const [open, setOpen] = useState(false);
  const e = state?.fieldErrors ?? {};
  const v = (k: string) => state?.values?.[k] ?? "";

  if (!open) {
    return <Button type="button" onClick={() => setOpen(true)}>Nouveau formateur</Button>;
  }

  return (
    <div className="w-full space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Créer un compte formateur</p>
        <p className="text-sm text-foreground-secondary">
          Le compte est utilisable immédiatement avec l&apos;email et le mot de passe posés ici.
          Il aura son propre périmètre : ses formations, ses sessions, ses élèves.
        </p>
      </div>

      {state?.created ? (
        <p className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
          Compte créé pour <strong>{state.created.email}</strong>. Transmets-lui l&apos;email et le mot de passe
          que tu viens de choisir.
        </p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <FormError message={state?.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="t-name" label="Nom" errors={e.name}>
            <Input id="t-name" name="name" defaultValue={v("name")} placeholder="Fatima Bensaïd" required />
          </FormField>
          <FormField id="t-email" label="Email" errors={e.email}>
            <Input id="t-email" name="email" type="email" defaultValue={v("email")} placeholder="fatima@exemple.fr" required />
          </FormField>
        </div>
        <PasswordField errors={e.password} />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Création…">Créer le compte</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
        </div>
      </form>
    </div>
  );
}

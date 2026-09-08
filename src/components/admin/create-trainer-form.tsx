"use client";

import { useActionState, useState } from "react";
import { createTrainer, type AccountState } from "@/lib/actions/users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "./form-field";
import { SubmitButton } from "./submit-button";

// Création d'un compte formateur. Aucun mot de passe n'est transmis : la
// personne pose le sien depuis le lien reçu par mail.
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
          Il recevra une invitation pour choisir son mot de passe. Il aura son propre périmètre : ses formations,
          ses sessions, ses élèves.
        </p>
      </div>

      {state?.created?.invited ? (
        <p className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
          Compte créé pour <strong>{state.created.email}</strong>. Invitation envoyée à {state.created.sentTo}
          {state.created.sandbox ? " (bac à sable : rien n'est parti au vrai destinataire)" : ""}.
        </p>
      ) : null}
      {state?.created && !state.created.invited ? (
        <p className="rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">
          Compte créé pour <strong>{state.created.email}</strong>, mais l&apos;invitation n&apos;est pas partie :{" "}
          {state.created.error}
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
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Création…">Créer et inviter</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
        </div>
      </form>
    </div>
  );
}

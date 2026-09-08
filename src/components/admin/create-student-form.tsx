"use client";

import { useActionState, useState } from "react";
import { createStudent, type AccountState } from "@/lib/actions/users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "./form-field";
import { NativeSelect } from "./native-select";
import { SubmitButton } from "./submit-button";

// Création d'un élève, avec son entreprise de rattachement. Si elle n'existe
// pas encore, on la crée dans la foulée plutôt que d'obliger un aller-retour.
export function CreateStudentForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<AccountState, FormData>(createStudent, undefined);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const e = state?.fieldErrors ?? {};
  const v = (k: string) => state?.values?.[k] ?? "";

  if (!open) {
    return <Button type="button" onClick={() => setOpen(true)}>Nouvel élève</Button>;
  }

  return (
    <div className="w-full space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Créer un élève</p>
        <p className="text-sm text-foreground-secondary">
          Le compte est créé et l&apos;élève reçoit son invitation. Son inscription à une session se fait ensuite
          depuis la fiche de la session.
        </p>
      </div>

      {state?.created?.invited ? (
        <p className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
          Élève créé : <strong>{state.created.email}</strong>. Invitation envoyée à {state.created.sentTo}
          {state.created.sandbox ? " (bac à sable : l'élève n'a rien reçu)" : ""}.
        </p>
      ) : null}
      {state?.created && !state.created.invited ? (
        <p className="rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">
          Élève créé : <strong>{state.created.email}</strong>, mais l&apos;invitation n&apos;est pas partie :{" "}
          {state.created.error}
        </p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <FormError message={state?.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="s-name" label="Nom" errors={e.name}>
            <Input id="s-name" name="name" defaultValue={v("name")} placeholder="Jean Dupont" required />
          </FormField>
          <FormField id="s-email" label="Email" errors={e.email}>
            <Input id="s-email" name="email" type="email" defaultValue={v("email")} placeholder="jean@exemple.fr" required />
          </FormField>
        </div>

        <FormField id="s-company" label="Entreprise" errors={e.companyId}>
          <NativeSelect
            id="s-company"
            name="companyId"
            value={choice === "__new__" ? "" : choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">À titre personnel (sans entreprise)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </NativeSelect>
        </FormField>

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[16rem] flex-1 text-xs text-foreground-secondary">
            Ou saisis une entreprise absente de la liste : elle sera créée
            <Input name="newCompanyName" placeholder="Nom de l'entreprise" className="mt-1" />
          </label>
        </div>

        <div className="flex gap-2">
          <SubmitButton pendingLabel="Création…">Créer et inviter</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
        </div>
      </form>
    </div>
  );
}

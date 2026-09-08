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
          <NativeSelect id="s-company" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">À titre personnel (sans entreprise)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="__new__">＋ Créer une nouvelle entreprise…</option>
          </NativeSelect>
        </FormField>

        {/* La valeur envoyée dépend du choix : une entreprise existante, ou
            les champs complets d'une nouvelle. Une entreprise n'est pas
            qu'un nom, on ne crée donc pas de fiche au rabais. */}
        <input type="hidden" name="companyMode" value={choice === "__new__" ? "nouvelle" : choice ? "existante" : ""} />
        <input type="hidden" name="companyId" value={choice === "__new__" ? "" : choice} />

        {choice === "__new__" ? (
          <div className="space-y-4 rounded-md border bg-surface/50 p-4">
            <p className="text-sm font-medium">Nouvelle entreprise</p>
            <FormField id="c-name" label="Nom" errors={e.company_name}>
              <Input id="c-name" name="company_name" defaultValue={v("company_name")} placeholder="Nettoyage Pro Services" required />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="c-siret" label="SIRET" hint="14 chiffres" errors={e.company_siret}>
                <Input id="c-siret" name="company_siret" inputMode="numeric" defaultValue={v("company_siret")} />
              </FormField>
              <FormField id="c-sector" label="Secteur" errors={e.company_sector}>
                <Input id="c-sector" name="company_sector" defaultValue={v("company_sector")} placeholder="BTP, santé, propreté…" />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="c-contact" label="Contact" errors={e.company_contactName}>
                <Input id="c-contact" name="company_contactName" defaultValue={v("company_contactName")} />
              </FormField>
              <FormField id="c-phone" label="Téléphone" errors={e.company_contactPhone}>
                <Input id="c-phone" name="company_contactPhone" type="tel" defaultValue={v("company_contactPhone")} />
              </FormField>
            </div>
            <FormField id="c-email" label="Email du contact" hint="Sert aux conventions à signer" errors={e.company_contactEmail}>
              <Input id="c-email" name="company_contactEmail" type="email" defaultValue={v("company_contactEmail")} />
            </FormField>
            <FormField id="c-address" label="Adresse" errors={e.company_address}>
              <Input id="c-address" name="company_address" defaultValue={v("company_address")} />
            </FormField>
          </div>
        ) : null}

        <div className="flex gap-2">
          <SubmitButton pendingLabel="Création…">Créer et inviter</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { inviteCompanyContact } from "@/lib/actions/users";
import type { AccountState } from "@/lib/actions/users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/admin/form-field";
import { PasswordField } from "@/components/admin/password-field";

// Ouvre l'accès du contact d'une entreprise : il reçoit un lien d'activation,
// jamais un mot de passe. Son compte n'a aucune permission — il ne voit que le
// dossier de sa société et les formations de ses salariés.
export function InviteContactForm({
  companyId,
  defaultName,
  defaultEmail,
}: {
  companyId: string;
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    inviteCompanyContact.bind(null, companyId),
    undefined,
  );

  if (state?.created) {
    return (
      <p className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
        Accès créé pour <strong>{state.created.email}</strong>. Transmets-lui l&apos;email et le mot de passe
        que tu viens de choisir.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">Ouvrir l&apos;accès du contact</p>
        <p className="mt-0.5 text-sm text-foreground-secondary">
          Il verra ses salariés en formation et le dossier de l&apos;entreprise. Jamais le travail
          ni les notes de ses salariés. Aucun mail n&apos;est envoyé : tu transmets les identifiants.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="contact-name" label="Nom du contact" errors={state?.fieldErrors?.name}>
          <Input id="contact-name" name="name" defaultValue={defaultName ?? ""} placeholder="Marie Durand" required />
        </FormField>
        <FormField id="contact-email" label="Email" errors={state?.fieldErrors?.email}>
          <Input id="contact-email" name="email" type="email" defaultValue={defaultEmail ?? ""} placeholder="marie@durand.fr" required />
        </FormField>
      </div>

      <PasswordField errors={state?.fieldErrors?.password} />

      {state?.error ? <p className="text-sm text-status-red">{state.error}</p> : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Création…" : "Créer le compte"}
      </Button>
    </form>
  );
}

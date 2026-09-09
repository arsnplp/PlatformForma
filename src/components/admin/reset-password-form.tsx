"use client";

import { useActionState, useState } from "react";
import { setUserPassword, type AccountState } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";

// Rouvrir l'accès de quelqu'un qui a perdu son mot de passe. Aucun mail ne
// part : on pose le nouveau et on le transmet soi-même.
export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action] = useActionState<AccountState, FormData>(setUserPassword.bind(null, userId), undefined);
  const [open, setOpen] = useState(false);

  if (state?.created) {
    return (
      <p className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
        Nouveau mot de passe posé pour <strong>{state.created.email}</strong>. Transmets-le-lui.
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Changer son mot de passe
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">Changer son mot de passe</p>
        <p className="mt-0.5 text-sm text-foreground-secondary">
          L&apos;ancien cesse aussitôt de fonctionner. Aucun mail n&apos;est envoyé : tu transmets le nouveau.
        </p>
      </div>
      <PasswordField errors={state?.fieldErrors?.password} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Annuler</Button>
      </div>
    </form>
  );
}

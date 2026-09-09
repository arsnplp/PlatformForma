"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { EnrollState } from "@/lib/actions/enrollments";
import { Input } from "@/components/ui/input";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { PasswordField } from "@/components/admin/password-field";
import { NativeSelect } from "@/components/admin/native-select";

// Inscrire un élève : existant (liste « mes élèves ») OU nouveau (nom + email → compte créé).
export function EnrollForm({
  action,
  students,
}: {
  action: (prev: EnrollState, formData: FormData) => Promise<EnrollState>;
  students: { id: string; name: string; email: string }[];
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (k: string) => state?.values?.[k] ?? "";

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Inscrire un élève</p>
        <p className="text-sm text-foreground-secondary">
          Choisis un élève existant, ou renseigne nom, email et mot de passe : le compte est créé et
          inscrit dans la foulée. Aucun mail n&apos;est envoyé, tu transmets les identifiants.
        </p>
      </div>

      {state?.created ? (
        <div className="rounded-md bg-status-green-bg px-3 py-2 text-sm text-status-green">
          Compte créé pour <strong>{state.created.email}</strong> et inscrit à la session. Transmets-lui
          l&apos;email et le mot de passe que tu viens de choisir —{" "}
          <Link href={`/admin/eleves/${state.created.userId}`} className="underline">sa fiche</Link>.
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <FormError message={state?.error} />
        <FormField id="userId" label="Élève existant" errors={e.userId}>
          <NativeSelect id="userId" name="userId" defaultValue={v("userId")}>
            <option value="">— Nouveau, ou choisir dans la liste —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.email}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="e-name" label="Nom" errors={e.name}>
            <Input id="e-name" name="name" defaultValue={v("name")} placeholder="Jean Dupont" />
          </FormField>
          <FormField id="e-email" label="Email" errors={e.email}>
            <Input id="e-email" name="email" type="email" defaultValue={v("email")} placeholder="jean@exemple.fr" />
          </FormField>
        </div>
        {/* Utile seulement pour un nouveau compte : ignoré si l'on choisit
            un élève déjà présent dans la liste. */}
        <PasswordField label="Mot de passe (nouvel élève)" errors={e.password} required={false} />
        <SubmitButton pendingLabel="Inscription…">Inscrire</SubmitButton>
      </form>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/actions/shared";
import { ProspectStatus } from "@/generated/prisma/enums";
import { PROSPECT_STATUS } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { NativeSelect } from "@/components/admin/native-select";

export type ProspectFormValues = {
  companyId: string;
  status: ProspectStatus;
  firstCallAt: string; // datetime-local
  notes: string | null;
};

export function ProspectForm({
  mode,
  action,
  initial,
  companies,
  cancelHref,
}: {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: ProspectFormValues;
  companies: { id: string; name: string }[];
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (key: keyof ProspectFormValues) => state?.values?.[key] ?? initial?.[key] ?? "";
  const isEdit = mode === "edit";

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormError message={state?.error} />

      <FormField id="companyId" label="Entreprise" errors={e.companyId}>
        {isEdit ? (
          <>
            <Input value={companies[0].name} disabled />
            <input type="hidden" name="companyId" value={initial!.companyId} />
          </>
        ) : (
          <NativeSelect id="companyId" name="companyId" defaultValue={v("companyId")} required>
            <option value="" disabled>
              Choisir…
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="status" label="Statut" errors={e.status}>
          <NativeSelect id="status" name="status" defaultValue={v("status") || ProspectStatus.new}>
            {Object.values(ProspectStatus).map((s) => (
              <option key={s} value={s}>
                {PROSPECT_STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <FormField id="firstCallAt" label="Premier appel" errors={e.firstCallAt}>
        <Input id="firstCallAt" name="firstCallAt" type="datetime-local" defaultValue={v("firstCallAt")} />
      </FormField>

      <FormField id="notes" label="Notes" errors={e.notes}>
        <Textarea id="notes" name="notes" rows={5} defaultValue={v("notes")} />
      </FormField>

      <div className="flex items-center gap-2 pt-2">
        <SubmitButton>{isEdit ? "Enregistrer" : "Créer le prospect"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Annuler</Link>
        </Button>
      </div>
    </form>
  );
}

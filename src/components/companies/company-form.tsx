"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/actions/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";

export type CompanyFormValues = {
  name: string;
  siret: string | null;
  sector: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
};

export function CompanyForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: CompanyFormValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (key: keyof CompanyFormValues) => state?.values?.[key] ?? initial?.[key] ?? "";

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormError message={state?.error} />

      <FormField id="name" label="Nom" errors={e.name}>
        <Input id="name" name="name" defaultValue={v("name")} required autoFocus />
      </FormField>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="siret" label="SIRET" hint="14 chiffres" errors={e.siret}>
          <Input id="siret" name="siret" inputMode="numeric" defaultValue={v("siret")} />
        </FormField>
        <FormField id="sector" label="Secteur" errors={e.sector}>
          <Input id="sector" name="sector" defaultValue={v("sector")} placeholder="BTP, santé, retail…" />
        </FormField>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="contactName" label="Contact" errors={e.contactName}>
          <Input id="contactName" name="contactName" defaultValue={v("contactName")} />
        </FormField>
        <FormField id="contactPhone" label="Téléphone" errors={e.contactPhone}>
          <Input id="contactPhone" name="contactPhone" type="tel" defaultValue={v("contactPhone")} />
        </FormField>
      </div>

      <FormField id="contactEmail" label="Email du contact" errors={e.contactEmail}>
        <Input id="contactEmail" name="contactEmail" type="email" defaultValue={v("contactEmail")} />
      </FormField>

      <FormField id="address" label="Adresse" errors={e.address}>
        <Textarea id="address" name="address" rows={2} defaultValue={v("address")} />
      </FormField>

      <div className="flex items-center gap-2 pt-2">
        <SubmitButton>{initial ? "Enregistrer" : "Créer l'entreprise"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Annuler</Link>
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/actions/shared";
import { SessionStatus } from "@/generated/prisma/enums";
import { SESSION_STATUS } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { NativeSelect } from "@/components/admin/native-select";

export type FormationOption = {
  id: string;
  name: string;
  versions: { id: string; versionNumber: number; status: "active" | "archived" | "draft"; changelog: string | null }[];
};

export type SessionFormValues = {
  name: string;
  formationId: string;
  formationVersionId: string;
  companyId: string | null;
  trainerId: string | null;
  startDate: string; // yyyy-mm-dd
  endDate: string;
  durationHours: string;
  status: SessionStatus;
};

export function SessionForm({
  mode,
  action,
  initial,
  formations,
  companies,
  trainers,
  cancelHref,
  lockedVersionLabel,
}: {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: Partial<SessionFormValues>;
  formations: FormationOption[];
  companies: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  cancelHref: string;
  /// En édition : la version est gelée, on l'affiche sans la rendre modifiable.
  lockedVersionLabel?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (key: keyof SessionFormValues) => state?.values?.[key] ?? initial?.[key] ?? "";

  const [formationId, setFormationId] = useState<string>(v("formationId"));
  const formation = formations.find((f) => f.id === formationId);
  const activeVersion = formation?.versions.find((x) => x.status === "active");
  const [versionId, setVersionId] = useState<string>(v("formationVersionId") || activeVersion?.id || "");

  function onFormationChange(id: string) {
    setFormationId(id);
    const f = formations.find((x) => x.id === id);
    setVersionId(f?.versions.find((x) => x.status === "active")?.id ?? f?.versions[0]?.id ?? "");
  }

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormError message={state?.error} />

      <FormField id="name" label="Nom" errors={e.name}>
        <Input id="name" name="name" defaultValue={v("name")} required autoFocus placeholder="Session mars 2027 — Bâtiments Durand" />
      </FormField>

      {mode === "edit" ? (
        <FormField id="version" label="Formation et version" hint="Une session reste liée pour toujours à la version choisie à sa création.">
          <Input id="version" value={lockedVersionLabel ?? ""} disabled />
          <input type="hidden" name="formationVersionId" value={v("formationVersionId")} />
        </FormField>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField id="formationId" label="Formation" errors={formationId ? undefined : e.formationVersionId}>
            <NativeSelect id="formationId" name="formationId" value={formationId} onChange={(ev) => onFormationChange(ev.target.value)} required>
              <option value="" disabled>
                Choisir…
              </option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            id="formationVersionId"
            label="Version"
            hint={activeVersion && versionId === activeVersion.id ? "Version active (par défaut)" : versionId ? "Version remplacée : pour rejouer un ancien programme" : undefined}
            errors={e.formationVersionId}
          >
            <NativeSelect id="formationVersionId" name="formationVersionId" value={versionId} onChange={(ev) => setVersionId(ev.target.value)} required disabled={!formation}>
              {!formation ? <option value="">—</option> : null}
              {formation?.versions.map((x) => (
                <option key={x.id} value={x.id}>
                  v{x.versionNumber} · {x.status === "active" ? "active" : "remplacée"}
                  {x.changelog ? ` — ${x.changelog}` : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="companyId" label="Entreprise cliente" errors={e.companyId}>
          <NativeSelect id="companyId" name="companyId" defaultValue={v("companyId")}>
            <option value="">Aucune (inter-entreprises / particuliers)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="trainerId" label="Formateur animateur" hint="Peut être un autre formateur que le propriétaire" errors={e.trainerId}>
          <NativeSelect id="trainerId" name="trainerId" defaultValue={v("trainerId")}>
            <option value="">Non défini</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="startDate" label="Début" errors={e.startDate}>
          <Input id="startDate" name="startDate" type="date" defaultValue={v("startDate")} required />
        </FormField>
        <FormField id="endDate" label="Fin" errors={e.endDate}>
          <Input id="endDate" name="endDate" type="date" defaultValue={v("endDate")} required />
        </FormField>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="durationHours" label="Durée totale (heures)" hint="Mention obligatoire sur la convocation et l'attestation." errors={e.durationHours}>
          <Input id="durationHours" name="durationHours" type="number" min={1} max={2000} defaultValue={v("durationHours")} placeholder="63" />
        </FormField>
        <FormField id="status" label="Statut" errors={e.status}>
          <NativeSelect id="status" name="status" defaultValue={v("status") || "planned"}>
            {Object.values(SessionStatus).map((s) => (
              <option key={s} value={s}>
                {SESSION_STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <SubmitButton>{mode === "edit" ? "Enregistrer" : "Créer la session"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Annuler</Link>
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/actions/shared";
import { TriggerType, TriggerAnchor, ActionType } from "@/generated/prisma/enums";
import { PHASES, TRIGGER_TYPE, TRIGGER_ANCHOR, ACTION_TYPE } from "@/lib/labels";
import { RECIPIENTS, RECIPIENT_KEYS } from "@/lib/process/action-params";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { NativeSelect } from "@/components/admin/native-select";

export type StepFormValues = {
  name: string;
  description: string | null;
  phase: number;
  assigneeUserId: string | null;
  assigneeRoleId: string | null;
  triggerType: TriggerType;
  triggerAnchor: TriggerAnchor | null;
  triggerOffsetDays: number | null;
  actionType: ActionType;
  messageTemplateId: string | null;
  recipient: string | null;
};

export function StepForm({
  mode,
  action,
  initial,
  users,
  roles,
  templates,
  cancelHref,
}: {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: Partial<StepFormValues>;
  users: { id: string; name: string }[];
  roles: { id: string; label: string }[];
  templates: { id: string; name: string; subject: string }[];
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const v = (key: keyof StepFormValues) => state?.values?.[key] ?? (initial?.[key] == null ? "" : String(initial[key]));
  const [triggerType, setTriggerType] = useState<string>(v("triggerType") || "manual");
  const [actionType, setActionType] = useState<string>(v("actionType") || "checklist_only");

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state?.error} />

      <FormField id="name" label="Étape" errors={e.name}>
        <Input id="name" name="name" defaultValue={v("name")} required autoFocus placeholder="Convocation envoyée" />
      </FormField>

      <FormField id="description" label="Note" hint="Précisions, qui fait quoi (ex. assistant(e)), pièces à joindre…" errors={e.description}>
        <Textarea id="description" name="description" rows={2} defaultValue={v("description")} />
      </FormField>

      <div className="grid gap-6 sm:grid-cols-3">
        <FormField id="phase" label="Phase" errors={e.phase}>
          <NativeSelect id="phase" name="phase" defaultValue={v("phase") || "0"}>
            {PHASES.map((p) => (
              <option key={p.n} value={p.n}>
                {p.n} · {p.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="assigneeUserId" label="Assigné à" errors={e.assigneeUserId}>
          <NativeSelect id="assigneeUserId" name="assigneeUserId" defaultValue={v("assigneeUserId")}>
            <option value="">Personne en particulier</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="assigneeRoleId" label="ou à un rôle" errors={e.assigneeRoleId}>
          <NativeSelect id="assigneeRoleId" name="assigneeRoleId" defaultValue={v("assigneeRoleId")}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <FormField id="triggerType" label="Déclencheur" hint={TRIGGER_TYPE[triggerType as TriggerType]?.hint} errors={e.triggerType}>
          <NativeSelect id="triggerType" name="triggerType" value={triggerType} onChange={(ev) => setTriggerType(ev.target.value)}>
            {Object.values(TriggerType).map((t) => (
              <option key={t} value={t}>
                {TRIGGER_TYPE[t].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="triggerAnchor" label="Ancre" errors={e.triggerAnchor}>
          <NativeSelect id="triggerAnchor" name="triggerAnchor" defaultValue={v("triggerAnchor")} disabled={triggerType === "manual"}>
            <option value="">—</option>
            {Object.values(TriggerAnchor).map((a) => (
              <option key={a} value={a}>
                {TRIGGER_ANCHOR[a]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="triggerOffsetDays" label="Décalage (jours)" hint="−7 = J-7, 0 = le jour même, +90 = J+90" errors={e.triggerOffsetDays}>
          <Input id="triggerOffsetDays" name="triggerOffsetDays" type="number" min={-365} max={365} defaultValue={v("triggerOffsetDays")} disabled={triggerType !== "time_offset"} />
        </FormField>
      </div>

      <FormField id="actionType" label="Action" hint="Ce que fait la plateforme quand l'étape se déclenche." errors={e.actionType}>
        <NativeSelect id="actionType" name="actionType" value={actionType} onChange={(ev) => setActionType(ev.target.value)}>
          {Object.values(ActionType).map((a) => (
            <option key={a} value={a} disabled={Boolean(ACTION_TYPE[a].availableFrom)}>
              {ACTION_TYPE[a].label}
              {ACTION_TYPE[a].availableFrom ? ` (palier ${ACTION_TYPE[a].availableFrom})` : ""}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      {actionType === "send_message" ? (
        <div className="grid gap-6 rounded-lg border p-4 sm:grid-cols-2">
          <FormField id="messageTemplateId" label="Mail à envoyer" hint={templates.length === 0 ? "Aucun template dans cette version : crée-le dans l'onglet Mails." : "Templates de cette version."} errors={e.messageTemplateId}>
            <NativeSelect id="messageTemplateId" name="messageTemplateId" defaultValue={v("messageTemplateId")} disabled={templates.length === 0}>
              <option value="">Choisir…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="recipient" label="Destinataire" errors={e.recipient}>
            <NativeSelect id="recipient" name="recipient" defaultValue={v("recipient") || "students"}>
              {RECIPIENT_KEYS.map((k) => (
                <option key={k} value={k}>{RECIPIENTS[k]}</option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-2">
        <SubmitButton>{mode === "edit" ? "Enregistrer" : "Ajouter l'étape"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Annuler</Link>
        </Button>
      </div>
    </form>
  );
}

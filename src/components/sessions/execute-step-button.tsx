"use client";

import { useActionState } from "react";
import { executeStepNow, type ExecuteState } from "@/lib/actions/execute";
import { Button } from "@/components/ui/button";

// Déclenche l'envoi d'une étape à la main et affiche le compte rendu.
export function ExecuteStepButton({ instanceId, disabled }: { instanceId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ExecuteState, FormData>(
    async () => executeStepNow(instanceId),
    undefined,
  );
  const r = state?.report;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <form action={action}>
        <Button type="submit" variant="secondary" size="sm" className="h-7" disabled={disabled || pending}>
          {pending ? "Envoi…" : "Exécuter maintenant"}
        </Button>
      </form>
      {state?.error ? <span className="text-xs text-status-red">{state.error}</span> : null}
      {r ? (
        <span className={`max-w-64 text-right text-xs ${r.sent > 0 ? "text-status-green" : "text-status-orange"}`}>
          {r.sent > 0
            ? `${r.sent} mail(s) envoyé(s)${r.sandbox ? ` vers ${r.redirectedTo} (bac à sable)` : ""}`
            : null}
          {r.failed > 0 ? ` · ${r.failed} échec(s) : ${r.details.find((d) => !d.ok)?.error ?? ""}` : null}
          {r.skipped.length > 0 ? r.skipped.join(" ") : null}
        </span>
      ) : null}
    </span>
  );
}

"use client";

import { useActionState } from "react";
import { executeStepNow, type ExecuteState } from "@/lib/actions/execute";
import { Button } from "@/components/ui/button";

// Relance une étape dont l'envoi a échoué.
export function RetryExecutionButton({ instanceId }: { instanceId: string }) {
  const [state, action, pending] = useActionState<ExecuteState, FormData>(async () => executeStepNow(instanceId), undefined);
  const r = state?.report;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <form action={action}>
        <Button type="submit" variant="outline" size="sm" className="h-7" disabled={pending}>
          {pending ? "…" : "Relancer"}
        </Button>
      </form>
      {r ? (
        <span className={`text-xs ${r.sent > 0 ? "text-status-green" : "text-status-orange"}`}>
          {r.sent > 0 ? `${r.sent} envoi(s)` : (r.skipped[0] ?? r.details.find((d) => !d.ok)?.error ?? "échec")}
        </span>
      ) : null}
    </span>
  );
}

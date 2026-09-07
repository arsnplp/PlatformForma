"use client";

import { useState, useTransition } from "react";
import { resendInvitation } from "@/lib/actions/enrollments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Renvoie un lien d'activation à l'élève (lien perdu, expiré, envoi échoué).
export function ResendInvitation({ userId }: { userId: string }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            try {
              setResult(await resendInvitation(userId));
            } catch (e) {
              setResult({ ok: false, message: e instanceof Error ? e.message : "Envoi impossible" });
            }
          })
        }
      >
        {pending ? "Envoi…" : "Renvoyer l'invitation"}
      </Button>
      {result ? (
        <span className={cn("text-xs", result.ok ? "text-status-green" : "text-status-red")}>{result.message}</span>
      ) : null}
    </span>
  );
}

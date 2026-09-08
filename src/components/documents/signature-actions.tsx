"use client";

import { useState, useTransition } from "react";
import { requestSignature, refreshSignature, getSigningUrl } from "@/lib/actions/signature";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; message: string } | null;

// Actions de signature sur une pièce. Côté formateur : demander, actualiser.
// Côté signataire : ouvrir la page de signature.
export function SignatureActions({
  documentId,
  status,
  canRequest,
  canSign,
}: {
  documentId: string;
  status: "na" | "pending" | "signed";
  canRequest: boolean;
  canSign: boolean;
}) {
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      setResult(null);
      setResult(await action());
    });
  }

  function sign() {
    startTransition(async () => {
      setResult(null);
      const outcome = await getSigningUrl(documentId);
      if ("error" in outcome) { setResult({ ok: false, message: outcome.error }); return; }
      window.open(outcome.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {canRequest && status === "na" ? (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => requestSignature(documentId))}>
          {pending ? "…" : "Demander la signature"}
        </Button>
      ) : null}

      {status === "pending" && canSign ? (
        <Button type="button" size="sm" disabled={pending} onClick={sign}>
          {pending ? "…" : "Signer"}
        </Button>
      ) : null}

      {status === "pending" ? (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => refreshSignature(documentId))}>
          {pending ? "…" : "Actualiser"}
        </Button>
      ) : null}

      {result ? (
        <span className={cn("text-xs", result.ok ? "text-status-green" : "text-status-red")}>{result.message}</span>
      ) : null}
    </span>
  );
}

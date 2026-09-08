"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateTimeSheet } from "@/lib/actions/time-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Produit le relevé FOAD et le classe au dossier de l'élève.
export function GenerateTimeSheet({ sessionId, userId }: { sessionId: string; userId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending}
        onClick={() => startTransition(async () => {
          setResult(await generateTimeSheet(sessionId, userId));
          router.refresh();
        })}>
        {pending ? "…" : "Relevé de temps (PDF)"}
      </Button>
      {result ? <span className={cn("text-xs", result.ok ? "text-status-green" : "text-status-red")}>{result.message}</span> : null}
    </span>
  );
}

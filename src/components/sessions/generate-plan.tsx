"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateSessionPlan } from "@/lib/actions/plan";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Génère le plan de formation en PDF et le classe au dossier de la session.
export function GeneratePlan({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending}
        onClick={() => startTransition(async () => {
          setResult(await generateSessionPlan(sessionId));
          router.refresh();
        })}>
        {pending ? "…" : "Générer le plan de formation"}
      </Button>
      {result ? (
        <span className={cn("text-xs", result.ok ? "text-status-green" : "text-status-red")}>{result.message}</span>
      ) : null}
    </span>
  );
}

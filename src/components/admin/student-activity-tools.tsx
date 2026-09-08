"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateActivityFor, clearActivityFor } from "@/lib/actions/demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Fabrique ou efface l'activité d'un élève sur une session de démonstration.
// Le refus hors démonstration vient du serveur, pas de ce composant.
export function StudentActivityTools({ sessionId, userId }: { sessionId: string; userId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      setResult(await action());
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending}
          onClick={() => run(() => generateActivityFor(sessionId, userId))}>
          {pending ? "…" : "Générer une activité réaliste"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending}
          onClick={() => run(() => clearActivityFor(sessionId, userId))}>
          Effacer l&apos;activité
        </Button>
      </div>
      {result ? (
        <p className={cn("text-xs", result.ok ? "text-status-green" : "text-status-orange")}>{result.message}</p>
      ) : null}
    </div>
  );
}

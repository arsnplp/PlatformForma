"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateDemoSession, purgeDemoData } from "@/lib/actions/demo";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "./confirm-button";
import { cn } from "@/lib/utils";

// Génération et purge des données de démonstration.
export function DemoPanel() {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending}
          onClick={() => startTransition(async () => { setResult(await generateDemoSession()); router.refresh(); })}>
          {pending ? "Génération…" : "Générer une session de démonstration"}
        </Button>
        <ConfirmButton
          action={async () => { await purgeDemoData(); }}
          title="Purger toutes les données de démonstration ?"
          description="Sessions marquées démonstration, élèves fictifs, activité, émargements, pièces et formations de démonstration : tout disparaît. Les données réelles ne sont pas touchées."
          confirmLabel="Tout purger"
          variant="outline"
        >
          Purger les données de démonstration
        </ConfirmButton>
      </div>
      {result ? (
        <p className={cn("rounded-md px-3 py-2 text-sm", result.ok ? "bg-status-green-bg text-status-green" : "bg-status-red-bg text-status-red")}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

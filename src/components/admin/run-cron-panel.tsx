"use client";

import { useState, useTransition } from "react";
import { runDueStepsNow, type RunState } from "@/lib/actions/cron";
import { Button } from "@/components/ui/button";

// Panneau de déclenchement manuel du scan (simulation ou envoi réel).
export function RunCronPanel({ sandbox, sandboxTo }: { sandbox: boolean; sandboxTo: string | null }) {
  const [state, setState] = useState<RunState>(undefined);
  const [pending, startTransition] = useTransition();

  const run = (dryRun: boolean) =>
    startTransition(async () => {
      setState(await runDueStepsNow(dryRun));
    });

  const s = state?.summary;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Lancer le scan maintenant</p>
        <p className="text-sm text-foreground-secondary">
          Même traitement que le cron quotidien de 7h (heure de Paris) : étapes d&apos;envoi dues aujourd&apos;hui ou en retard,
          sur les sessions planifiées ou en cours, hors démonstration.
        </p>
      </div>

      {sandbox ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Bac à sable</strong> — même lancé, le scan n&apos;enverra que vers {sandboxTo}.
        </p>
      ) : (
        <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">
          <strong>Mode production</strong> — les mails partiront réellement aux destinataires.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => run(true)} disabled={pending}>
          {pending ? "…" : "Simuler (aucun envoi)"}
        </Button>
        <Button type="button" onClick={() => run(false)} disabled={pending}>
          {pending ? "Exécution…" : "Exécuter"}
        </Button>
      </div>

      {s ? (
        <div className="space-y-2 rounded-md border bg-surface px-3 py-2 text-sm">
          <p>
            <span className="font-medium">{s.date}</span> · {s.candidates} étape(s) due(s) · {s.executed} exécutée(s) ·{" "}
            <span className="text-status-green">{s.sent} envoi(s)</span>
            {s.failed > 0 ? <span className="text-status-red"> · {s.failed} échec(s)</span> : null}
            {s.skipped > 0 ? <span className="text-foreground-secondary"> · {s.skipped} ignorée(s)</span> : null}
          </p>
          {s.items.length === 0 ? <p className="text-foreground-tertiary">Aucune étape à traiter aujourd&apos;hui.</p> : null}
          <ul className="space-y-1">
            {s.items.map((i) => (
              <li key={i.stepInstanceId} className="text-xs text-foreground-secondary">
                <span className="font-medium text-foreground">{i.step}</span> · {i.session} · {i.status}
                {i.sent > 0 ? ` · ${i.sent} envoi(s)` : ""}
                {i.note ? ` · ${i.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

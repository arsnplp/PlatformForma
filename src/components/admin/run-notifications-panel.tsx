"use client";

import { useState, useTransition } from "react";
import { runMessageNotificationsNow, type NotifyState } from "@/lib/actions/cron";
import { Button } from "@/components/ui/button";

// Notification des messages de fil non lus : même traitement que le passage
// automatique du quart d'heure, déclenché à la main.
export function RunNotificationsPanel() {
  const [state, setState] = useState<NotifyState>(undefined);
  const [pending, startTransition] = useTransition();

  const run = (dryRun: boolean) =>
    startTransition(async () => {
      setState(await runMessageNotificationsNow(dryRun));
    });

  const r = state?.report;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">Messages non lus</p>
        <p className="text-sm text-foreground-secondary">
          Prévient par mail qui n&apos;a pas ouvert ses messages sur la plateforme : rien pour un message déjà lu,
          un seul mail pour toute une salve, et pas plus d&apos;un rappel par fil et par 24 h. Hors démonstration.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => run(true)} disabled={pending}>
          {pending ? "…" : "Simuler (aucun envoi)"}
        </Button>
        <Button type="button" onClick={() => run(false)} disabled={pending}>
          {pending ? "Envoi…" : "Notifier maintenant"}
        </Button>
      </div>

      {r ? (
        <div className="space-y-2 rounded-md border bg-surface px-3 py-2 text-sm">
          <p>
            {r.pending} message(s) en attente · {r.notified} notification(s){r.dryRun ? " (simulation)" : ""}
            {r.failed > 0 ? ` · ${r.failed} échec(s)` : ""}
          </p>
          {r.details.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-foreground-secondary">
              {r.details.map((d, i) => (
                <li key={i}>
                  {d.ok ? "✓" : "✗"} {d.label} · {d.count} message(s) → {d.to}
                  {d.error ? ` — ${d.error}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {r.skipped.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-foreground-tertiary">
              {r.skipped.map((s, i) => <li key={i}>— {s}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

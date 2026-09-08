"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openHalfDay, refreshHalfDay, remindHalfDay, closeHalfDay, getTrainerSigningUrl, requestHalfDaySignature } from "@/lib/actions/attendance";
import { useEmbeddedSigning } from "./embedded-signing";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";

type Row = { attendanceId: string; userId: string; name: string; status: string; signedAt: string | null };
export type HalfDayView = {
  key: string;
  signatureSent: boolean;
  sheetSigned: boolean;
  dayLabel: string;
  dayIso: string;
  slot: "am" | "pm";
  opened: boolean;
  documentId: string | null;
  present: number;
  signed: number;
  absent: number;
  unsigned: number;
  rows: Row[];
};

const SLOT = { am: "Matin", pm: "Après-midi" } as const;

// Grille des demi-journées : une case par demi-journée, sa couleur dit d'un
// coup d'œil où il manque des signatures.
export function AttendanceGrid({
  sessionId,
  halfDays,
  students,
  isDemo,
  readOnly,
}: {
  sessionId: string;
  halfDays: HalfDayView[];
  students: { id: string; name: string }[];
  isDemo: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const { open: openSigning } = useEmbeddedSigning(() => {
    const selected = halfDays.find((h) => h.key === openKey);
    startTransition(async () => {
      if (selected?.documentId) await refreshHalfDay(selected.documentId);
      router.refresh();
    });
  });

  const selected = halfDays.find((h) => h.key === openKey) ?? null;

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });
      router.refresh();
    });
  }

  const days = [...new Set(halfDays.map((h) => h.dayIso))];

  return (
    <div className="space-y-4">
      {isDemo ? (
        <p className="rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">
          <strong>Session de démonstration</strong> — aucune demande n&apos;est envoyée au prestataire de signature,
          les présences se cochent localement.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-40 text-left text-xs font-medium text-foreground-secondary">Jour</th>
              <th className="text-left text-xs font-medium text-foreground-secondary">Matin</th>
              <th className="text-left text-xs font-medium text-foreground-secondary">Après-midi</th>
            </tr>
          </thead>
          <tbody>
            {days.map((dayIso) => (
              <tr key={dayIso}>
                <td className="pr-2 text-xs text-foreground-secondary">
                  {halfDays.find((h) => h.dayIso === dayIso)?.dayLabel}
                </td>
                {(["am", "pm"] as const).map((slot) => {
                  const cell = halfDays.find((h) => h.dayIso === dayIso && h.slot === slot);
                  if (!cell) return <td key={slot} />;
                  const total = cell.signed + cell.present + cell.unsigned;
                  const complete = cell.opened && cell.present === 0 && cell.sheetSigned;
                  return (
                    <td key={slot}>
                      <button
                        type="button"
                        onClick={() => { setOpenKey(cell.key); setAbsent(new Set()); setMessage(null); }}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
                          !cell.opened && "border-dashed text-foreground-tertiary hover:bg-surface",
                          cell.opened && complete && "border-status-green/40 bg-status-green-bg text-status-green",
                          cell.opened && !complete && "border-status-orange/40 bg-status-orange-bg text-status-orange",
                          openKey === cell.key && "ring-2 ring-brand",
                        )}
                      >
                        {cell.opened ? (
                          <>
                            <span className="font-medium">{cell.signed} / {total} signé(s)</span>
                            {cell.present === 0 && !cell.sheetSigned ? (
                              <span className="block">votre signature manque</span>
                            ) : null}
                            {cell.absent > 0 ? <span className="block">{cell.absent} absent(s)</span> : null}
                            {cell.unsigned > 0 ? <span className="block">{cell.unsigned} sans signature</span> : null}
                          </>
                        ) : (
                          <span>Non ouverte</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? (
        <p className={cn("rounded-md px-3 py-2 text-sm", message.ok ? "bg-status-green-bg text-status-green" : "bg-status-red-bg text-status-red")}>
          {message.text}
        </p>
      ) : null}

      {selected ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">
            {selected.dayLabel} · {SLOT[selected.slot]}
          </p>

          {!selected.opened ? (
            <>
              <p className="text-sm text-foreground-secondary">
                Décoche les absents, puis ouvre la demi-journée : seuls les présents seront appelés à signer.
              </p>
              <ul className="space-y-1">
                {students.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!absent.has(s.id)}
                        onChange={(e) =>
                          setAbsent((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                      />
                      {s.name}
                    </label>
                  </li>
                ))}
              </ul>
              {!readOnly ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      openHalfDay({
                        sessionId,
                        day: selected.dayIso,
                        slot: selected.slot,
                        presentUserIds: students.filter((s) => !absent.has(s.id)).map((s) => s.id),
                      }),
                    )
                  }
                >
                  {pending ? "Ouverture…" : `Ouvrir pour ${students.length - absent.size} présent(s)`}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <ol className="divide-y rounded-md border text-sm">
                {selected.rows.map((row) => (
                  <li key={row.attendanceId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>{row.name}</span>
                    <span className="flex items-center gap-2">
                      {row.signedAt ? (
                        <span className="text-xs text-foreground-secondary">
                          {new Date(row.signedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      ) : null}
                      {row.status === "signed" ? <StatusBadge tone="green">Signé</StatusBadge> : null}
                      {row.status === "present" ? <StatusBadge tone="yellow">En attente</StatusBadge> : null}
                      {row.status === "absent" ? <StatusBadge tone="gray">Absent</StatusBadge> : null}
                      {row.status === "unsigned" ? <StatusBadge tone="orange">Sans signature</StatusBadge> : null}
                    </span>
                  </li>
                ))}
              </ol>

              {!readOnly && selected.documentId ? (
                <div className="flex flex-wrap gap-2">
                  {!isDemo && !selected.signatureSent ? (
                    <Button type="button" size="sm" disabled={pending}
                      onClick={() => run(() => requestHalfDaySignature(selected.documentId!))}>
                      Envoyer les demandes de signature
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" disabled={pending}
                    onClick={() => run(() => refreshHalfDay(selected.documentId!))}>
                    Actualiser
                  </Button>
                  {!isDemo ? (
                    <>
                      <Button type="button" variant="ghost" size="sm" disabled={pending}
                        onClick={() => run(() => remindHalfDay(selected.documentId!))}>
                        Relancer les retardataires
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={pending}
                        onClick={() => startTransition(async () => {
                          const outcome = await getTrainerSigningUrl(selected.documentId!);
                          if ("error" in outcome) { setMessage({ ok: false, text: outcome.error }); return; }
                          await openSigning(outcome.url);
                        })}>
                        Signer comme formateur
                      </Button>
                    </>
                  ) : null}
                  {selected.present > 0 ? (
                    <Button type="button" variant="ghost" size="sm" disabled={pending}
                      onClick={() => run(() => closeHalfDay(selected.documentId!))}>
                      Clore la demi-journée
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

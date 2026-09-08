"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openSeance, refreshSeance, remindSeance, closeSeance, getTrainerSigningUrl, requestSeanceSignature } from "@/lib/actions/attendance";
import { planSeance, unplanSeance } from "@/lib/actions/seances";
import { useEmbeddedSigning } from "./embedded-signing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";

type Row = { attendanceId: string; userId: string; name: string; status: string; signedAt: string | null };

export type SeanceView = {
  blockId: string;
  title: string;
  place: string;
  durationLabel: string;
  note: string | null;
  seanceId: string | null;
  startsAtLocal: string | null;
  startsAtLabel: string | null;
  joinUrl: string | null;
  opened: boolean;
  documentId: string | null;
  signatureSent: boolean;
  sheetSigned: boolean;
  present: number;
  signed: number;
  absent: number;
  unsigned: number;
  rows: Row[];
};

// Séances de la session : ce sont elles qui définissent les émargements.
// Chaque séance se planifie (date + lien), puis s'émarge.
export function SeanceList({
  sessionId,
  seances,
  students,
  isDemo,
  readOnly,
}: {
  sessionId: string;
  seances: SeanceView[];
  students: { id: string; name: string }[];
  isDemo: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = seances.find((s) => s.blockId === openKey) ?? null;

  const { open: openSigning } = useEmbeddedSigning(() => {
    startTransition(async () => {
      if (selected?.documentId) await refreshSeance(selected.documentId);
      router.refresh();
    });
  });

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });
      router.refresh();
    });
  }

  if (seances.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-foreground-secondary">
        Aucune séance dans le programme de cette session. Ajoute des blocs « séance en classe virtuelle »
        dans le contenu de la formation : chaque séance donnera un émargement.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {isDemo ? (
        <p className="rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">
          <strong>Session de démonstration</strong> — aucune demande n&apos;est envoyée au prestataire de signature.
        </p>
      ) : null}

      <ol className="divide-y rounded-md border">
        {seances.map((s) => {
          const total = s.signed + s.present + s.unsigned;
          const complete = s.opened && s.present === 0 && s.sheetSigned;
          return (
            <li key={s.blockId}>
              <button
                type="button"
                onClick={() => { setOpenKey(s.blockId === openKey ? null : s.blockId); setAbsent(new Set()); setMessage(null); }}
                className={cn("flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-surface",
                  openKey === s.blockId && "bg-surface")}
              >
                <span className="min-w-0">
                  <span className="font-medium">{s.title}</span>
                  <span className="block text-xs text-foreground-tertiary">
                    {s.place} · {s.durationLabel}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  {s.startsAtLabel ? (
                    <span className="text-foreground-secondary">{s.startsAtLabel}</span>
                  ) : (
                    <StatusBadge tone="gray">À planifier</StatusBadge>
                  )}
                  {s.opened ? (
                    complete
                      ? <StatusBadge tone="green">{s.signed} / {total} signé(s)</StatusBadge>
                      : <StatusBadge tone="orange">{s.signed} / {total} signé(s){s.present === 0 && !s.sheetSigned ? " · votre signature manque" : ""}</StatusBadge>
                  ) : s.startsAtLabel ? <StatusBadge tone="yellow">Émargement à ouvrir</StatusBadge> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {message ? (
        <p className={cn("rounded-md px-3 py-2 text-sm", message.ok ? "bg-status-green-bg text-status-green" : "bg-status-red-bg text-status-red")}>
          {message.text}
        </p>
      ) : null}

      {selected ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">{selected.title}</p>
          {selected.note ? <p className="-mt-2 text-sm text-foreground-secondary">{selected.note}</p> : null}

          {/* ── Planification : date et lien, propres à cette session ── */}
          {!readOnly ? (
            <form
              className="flex flex-wrap items-end gap-2"
              action={(formData: FormData) =>
                run(() =>
                  planSeance({
                    sessionId,
                    contentBlockId: selected.blockId,
                    startsAt: String(formData.get("startsAt") ?? ""),
                    joinUrl: String(formData.get("joinUrl") ?? ""),
                  }),
                )
              }
            >
              <label className="text-xs text-foreground-secondary">
                Date et heure
                <Input type="datetime-local" name="startsAt" defaultValue={selected.startsAtLocal ?? ""} className="mt-1 h-8 w-56" required />
              </label>
              <label className="min-w-[16rem] flex-1 text-xs text-foreground-secondary">
                Lien de la classe virtuelle
                <Input type="url" name="joinUrl" defaultValue={selected.joinUrl ?? ""} placeholder="https://meet.google.com/…" className="mt-1 h-8" required />
              </label>
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                {selected.seanceId ? "Mettre à jour" : "Planifier"}
              </Button>
              {selected.seanceId && !selected.opened ? (
                <Button type="button" variant="ghost" size="sm" disabled={pending}
                  onClick={() => run(() => unplanSeance(selected.seanceId!))}>
                  Retirer du calendrier
                </Button>
              ) : null}
            </form>
          ) : null}

          {/* ── Émargement ── */}
          {selected.seanceId && !selected.opened ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm text-foreground-secondary">
                Décoche les absents, puis ouvre l&apos;émargement : seuls les présents seront appelés à signer.
              </p>
              <ul className="space-y-1">
                {students.map((student) => (
                  <li key={student.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!absent.has(student.id)}
                        onChange={(e) =>
                          setAbsent((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(student.id);
                            else next.add(student.id);
                            return next;
                          })
                        }
                      />
                      {student.name}
                    </label>
                  </li>
                ))}
              </ul>
              {!readOnly ? (
                <Button type="button" size="sm" disabled={pending}
                  onClick={() => run(() => openSeance({ seanceId: selected.seanceId!, presentUserIds: students.filter((s) => !absent.has(s.id)).map((s) => s.id) }))}>
                  {pending ? "Ouverture…" : `Ouvrir l'émargement pour ${students.length - absent.size} présent(s)`}
                </Button>
              ) : null}
            </div>
          ) : null}

          {selected.opened ? (
            <div className="space-y-3 border-t pt-3">
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
                      onClick={() => run(() => requestSeanceSignature(selected.documentId!))}>
                      Envoyer les demandes de signature
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" disabled={pending}
                    onClick={() => run(() => refreshSeance(selected.documentId!))}>
                    Actualiser
                  </Button>
                  {!isDemo ? (
                    <>
                      <Button type="button" variant="ghost" size="sm" disabled={pending}
                        onClick={() => run(() => remindSeance(selected.documentId!))}>
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
                      onClick={() => run(() => closeSeance(selected.documentId!))}>
                      Clore la séance
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

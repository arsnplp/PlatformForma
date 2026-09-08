"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAttendanceSigningUrl, refreshSeance, signDemoAttendance } from "@/lib/actions/attendance";
import { useEmbeddedSigning } from "./embedded-signing";
import { Button } from "@/components/ui/button";

// Bouton « Signer » de l'élève : un geste, sans quitter la page.
export function SignAttendance({
  attendanceId,
  documentId,
  isDemo,
  label = "Signer ma présence",
}: {
  attendanceId: string;
  documentId: string | null;
  isDemo: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // À la fermeture de la fenêtre de signature, on redemande le statut réel
  // plutôt que de croire l'interface sur parole.
  const { open, loading } = useEmbeddedSigning(() => {
    startTransition(async () => {
      if (documentId) await refreshSeance(documentId);
      router.refresh();
    });
  });

  function sign() {
    setError(null);
    startTransition(async () => {
      if (isDemo) {
        const result = await signDemoAttendance(attendanceId);
        if (!result.ok) setError(result.message);
        router.refresh();
        return;
      }
      const outcome = await getAttendanceSigningUrl(attendanceId);
      if ("error" in outcome) { setError(outcome.error); return; }
      await open(outcome.url);
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={sign} disabled={pending || loading}>
        {pending || loading ? "…" : label}
      </Button>
      {error ? <span className="text-xs text-status-red">{error}</span> : null}
    </span>
  );
}

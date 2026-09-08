"use client";

import { useEffect, useRef, useState } from "react";
import { recordHeartbeat } from "@/lib/actions/activity";
import { HEARTBEAT_SECONDS, IDLE_SECONDS, formatSeconds } from "@/lib/activity/config";
import { cn } from "@/lib/utils";

// Compteur de temps réellement passé sur la page (spec §9.2).
// Le battement ne part QUE si l'onglet est visible et qu'il y a eu une
// interaction récente : sans cela, un onglet laissé ouvert fabriquerait des
// heures de formation fictives et le relevé serait inutilisable en audit.
export function TimeTracker({
  sessionId,
  lessonId,
  initialSeconds,
}: {
  sessionId: string;
  lessonId: string;
  initialSeconds: number;
}) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [active, setActive] = useState(true);
  // Initialisé dans l'effet : lire l'horloge pendant le rendu rendrait le
  // composant impur.
  const lastInteraction = useRef(0);
  const sending = useRef(false);

  useEffect(() => {
    lastInteraction.current = Date.now();
    const touch = () => { lastInteraction.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, touch, { passive: true });
    document.addEventListener("visibilitychange", touch);

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastInteraction.current > IDLE_SECONDS * 1000;
      const visible = document.visibilityState === "visible";
      const counting = visible && !idle;
      setActive(counting);
      if (!counting || sending.current) return;

      sending.current = true;
      // Le serveur borne la valeur : ce battement ne vaut que son intervalle.
      recordHeartbeat({ sessionId, lessonId, seconds: HEARTBEAT_SECONDS })
        .then((result) => { if (result.ok && result.seconds) setSeconds((s) => s + result.seconds!); })
        .finally(() => { sending.current = false; });
    }, HEARTBEAT_SECONDS * 1000);

    return () => {
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, touch);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [sessionId, lessonId]);

  return (
    <p className="flex items-center gap-2 text-xs text-foreground-tertiary" aria-live="polite">
      <span
        aria-hidden
        className={cn("inline-block h-1.5 w-1.5 rounded-full", active ? "bg-status-green" : "bg-foreground-tertiary")}
      />
      Temps passé sur cette leçon : <span className="tabular-nums">{formatSeconds(seconds)}</span>
      <span className="text-foreground-tertiary">{active ? "· en cours" : "· en pause"}</span>
    </p>
  );
}

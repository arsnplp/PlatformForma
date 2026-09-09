"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };
type Action = { tool: string; summary: string; done: boolean };

const SUGGESTIONS = [
  "Qu'est-ce qui m'attend aujourd'hui ?",
  "Où en est chaque élève de ma session en cours ?",
  "Crée une formation, une session, et inscris-y des élèves",
];

// Mini Arsène, l'assistant du back-office. Il voit les données de la personne
// connectée et agit en son nom — mais toute écriture passe par une
// confirmation explicite : une phrase ambiguë ne doit rien créer.
export function AssistantBubble() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Action[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, busy]);

  async function ask(history: Message[], approved: string[] = []) {
    setBusy(true);
    setError(null);
    setPending([]);
    // La réponse s'écrit dans une bulle qu'on remplit au fil du flux.
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, approved }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "Mini Arsène est indisponible.");
        setMessages(history);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      const actions: Action[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; value?: string } & Partial<Action>;
          if (event.type === "text") {
            text += event.value ?? "";
            setMessages([...history, { role: "assistant", content: text }]);
          } else if (event.type === "action" && event.tool && event.summary !== undefined) {
            actions.push({ tool: event.tool, summary: event.summary, done: Boolean(event.done) });
          } else if (event.type === "error") {
            setError(event.value ?? "Erreur.");
          }
        }
      }

      // Une action jouée change les données affichées derrière la bulle.
      if (actions.some((a) => a.done)) router.refresh();
      setPending(actions.filter((a) => !a.done));
    } catch {
      setError("La connexion à Mini Arsène a échoué.");
      setMessages(history);
    } finally {
      setBusy(false);
    }
  }

  function send(value: string) {
    const question = value.trim();
    if (!question || busy) return;
    setDraft("");
    ask([...messages, { role: "user", content: question }]);
  }

  // Confirmer vaut pour TOUTE la demande en cours, pas seulement la première
  // action : sinon une demande en sept étapes ferait cliquer sept fois.
  // L'autorisation ne dure que ce tour-là.
  function confirm() {
    ask([...messages, { role: "user", content: "Oui, vas-y : fais tout ce que tu as annoncé." }], ["*"]);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir Mini Arsène"
        className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        Mini Arsène
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[min(34rem,80vh)] w-[min(26rem,calc(100vw-3rem))] flex-col rounded-xl border bg-background shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Mini Arsène</p>
          <p className="text-xs text-foreground-tertiary">Il voit vos dossiers et agit avec vos droits.</p>
        </div>
        <span className="flex items-center gap-1">
          {messages.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => { setMessages([]); setPending([]); setError(null); }}>
              Effacer
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setOpen(false)} aria-label="Fermer">✕</Button>
        </span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground-secondary">
              Posez une question sur vos élèves, vos sessions ou vos formations — ou confiez-moi le travail.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="block w-full rounded-md border px-3 py-2 text-left text-sm text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "bg-brand-soft" : "bg-surface",
              )}
            >
              {m.content || (busy ? "…" : "")}
            </div>
          </div>
        ))}

        {pending.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-status-orange bg-status-orange-bg px-3 py-2">
            <p className="text-xs font-medium text-status-orange">À confirmer</p>
            <p className="text-xs text-status-orange">
              Confirmer autorise l&apos;ensemble de ce que Mini Arsène vient d&apos;annoncer.
            </p>
            <ul className="space-y-1 text-sm">
              {pending.map((a, i) => <li key={i}>{a.summary}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="h-7" onClick={confirm} disabled={busy}>Confirmer</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setPending([])}>Annuler</Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">{error}</p> : null}
        <div ref={bottom} />
      </div>

      <div className="border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); }
          }}
          rows={2}
          placeholder={busy ? "Mini Arsène travaille…" : "Votre question…"}
          disabled={busy}
          className="resize-none text-sm"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-foreground-tertiary">Entrée pour envoyer</p>
          <Button type="button" size="sm" className="h-7" onClick={() => send(draft)} disabled={busy || !draft.trim()}>
            {busy ? "…" : "Envoyer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

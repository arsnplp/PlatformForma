"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "@/lib/actions/conversations";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Zone d'envoi d'un message. Le corps accepte le Markdown, comme le reste.
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(conversationId, body);
      if (result?.error) { setError(result.error); return; }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Écrire un message…"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
      />
      {error ? <p className="text-sm text-status-red">{error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-foreground-tertiary">Markdown accepté · ⌘+Entrée pour envoyer</p>
        <Button type="button" size="sm" onClick={send} disabled={pending || !body.trim()}>
          {pending ? "Envoi…" : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}

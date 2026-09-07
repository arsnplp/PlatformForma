"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/actions/shared";
import { MESSAGE_VARIABLES, SAMPLE_VALUES, renderVariables, renderConditionals } from "@/lib/messages/variables";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { cn } from "@/lib/utils";

export type MessageTemplateValues = { name: string; subject: string; body: string };

// Rendu Markdown minimal pour l'aperçu côté client (titres, gras, italique,
// listes, liens). L'envoi réel passera par le rendu serveur assaini.
function previewHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

  const out: string[] = [];
  let list: string[] | null = null;
  const flush = () => { if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; } };
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    const li = /^[-*]\s+(.*)$/.exec(t);
    const ol = /^\d+\.\s+(.*)$/.exec(t);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (li || ol) { list ??= []; list.push(`<li>${inline((li ?? ol)![1])}</li>`); }
    else { flush(); out.push(`<p>${inline(t)}</p>`); }
  }
  flush();
  return out.join("");
}

export function MessageTemplateForm({
  mode,
  action,
  initial,
  cancelHref,
}: {
  mode: "create" | "edit";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: MessageTemplateValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const e = state?.fieldErrors ?? {};
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(state?.values?.subject ?? initial?.subject ?? "");
  const [body, setBody] = useState(state?.values?.body ?? initial?.body ?? "");

  // Insère {{cle}} à la position du curseur dans le corps.
  function insert(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form action={formAction} className="space-y-6">
        <FormError message={state?.error} />

        <FormField id="name" label="Nom du template" hint="Usage interne : « Convocation (J-7) »" errors={e.name}>
          <Input id="name" name="name" defaultValue={state?.values?.name ?? initial?.name ?? ""} required autoFocus />
        </FormField>

        <FormField id="subject" label="Objet du mail" errors={e.subject}>
          <Input id="subject" name="subject" value={subject} onChange={(ev) => setSubject(ev.target.value)} required />
        </FormField>

        <FormField id="body" label="Corps du mail (Markdown)" hint="Titres ##, **gras**, listes -, liens. Clique une variable à droite pour l'insérer." errors={e.body}>
          <Textarea id="body" name="body" ref={bodyRef} value={body} onChange={(ev) => setBody(ev.target.value)} rows={22} required className="font-mono text-[13px] leading-relaxed" />
        </FormField>

        <div className="flex items-center gap-2">
          <SubmitButton>{mode === "edit" ? "Enregistrer" : "Créer le template"}</SubmitButton>
          <Button variant="ghost" asChild>
            <Link href={cancelHref}>Annuler</Link>
          </Button>
        </div>
      </form>

      <aside className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold">Variables</h2>
          <p className="mt-1 text-xs text-foreground-secondary">Remplacées à l&apos;envoi par les données réelles.</p>
          <p className="mt-2 rounded-md bg-surface px-2 py-1.5 text-xs text-foreground-secondary">
            Champ facultatif ? Entoure le passage qui en dépend :{" "}
            <span className="font-mono text-brand">{"{{#si entreprise.nom}}"}</span> … <span className="font-mono text-brand">{"{{/si}}"}</span>. Il disparaît
            si le champ est vide, au lieu de laisser une phrase bancale. L&apos;aperçu montre le cas où il est rempli.
          </p>
          <ul className="mt-3 space-y-1">
            {MESSAGE_VARIABLES.map((v) => (
              <li key={v.key}>
                <button
                  type="button"
                  onClick={() => insert(v.key)}
                  className="w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="font-mono text-xs text-brand">{`{{${v.key}}}`}</span>
                  <span className="block text-xs text-foreground-tertiary">{v.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Aperçu</h2>
          <p className="mt-1 text-xs text-foreground-secondary">Avec des valeurs d&apos;exemple.</p>
          <div className="mt-3 rounded-lg border">
            <p className="border-b px-3 py-2 text-xs">
              <span className="text-foreground-tertiary">Objet : </span>
              <span className="font-medium">{renderVariables(renderConditionals(subject, SAMPLE_VALUES), SAMPLE_VALUES) || "—"}</span>
            </p>
            <div
              className={cn(
                "prose-mail max-h-[32rem] overflow-y-auto px-3 py-3 text-sm",
                "[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold",
                "[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold",
                "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-medium",
                "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5",
                "[&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-surface [&_code]:px-1",
              )}
              dangerouslySetInnerHTML={{ __html: previewHtml(renderVariables(renderConditionals(body, SAMPLE_VALUES), SAMPLE_VALUES)) }}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}

import "server-only";

import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

// Markdown → HTML assaini. Sert à l'aperçu du back-office et, au palier 3 (c),
// au corps des mails envoyés. Le contenu vient d'un formateur : on assainit
// quand même, un template circule ensuite par email et dans l'espace élève.
export function markdownToHtml(markdown: string): string {
  const raw = marked.parse(markdown ?? "", { async: false, breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

import "server-only";

import { Marked, type Tokens } from "marked";
import { codeToHtml, bundledLanguages } from "shiki";
import DOMPurify from "isomorphic-dompurify";

// ─────────────────────────────────────────────────────────────────────────────
// Rendu Markdown de référence (spec §3.2), partagé back-office ↔ espace élève.
// Couvre : titres, gras/italique/barré, listes imbriquées, cases à cocher,
// citations, code coloré (Shiki), tables, liens, images, séparateurs, callouts.
// Le HTML est assaini : le contenu est écrit par des formateurs et lu par des
// élèves, il ne doit jamais pouvoir injecter de script.
// ─────────────────────────────────────────────────────────────────────────────

const CALLOUTS: Record<string, { label: string; kind: string }> = {
  note: { label: "Note", kind: "note" },
  tip: { label: "Conseil", kind: "tip" },
  important: { label: "Important", kind: "important" },
  warning: { label: "Attention", kind: "warning" },
  caution: { label: "Avertissement", kind: "caution" },
};

const SHIKI_THEME = "github-light";

function isSupportedLang(lang: string): boolean {
  return Object.prototype.hasOwnProperty.call(bundledLanguages, lang);
}

function createMarked() {
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    async: true,
    // Coloration syntaxique côté serveur : le HTML arrive déjà coloré au client.
    async walkTokens(token) {
      if (token.type !== "code") return;
      const t = token as Tokens.Code;
      const lang = (t.lang ?? "").trim().split(/\s+/)[0].toLowerCase();
      const html = await codeToHtml(t.text, {
        lang: lang && isSupportedLang(lang) ? lang : "text",
        theme: SHIKI_THEME,
      });
      // `escaped` évite que marked ré-échappe le HTML produit par Shiki.
      (t as Tokens.Code & { escaped?: boolean }).escaped = true;
      t.text = html;
    },
    renderer: {
      // Shiki a déjà produit le <pre><code> complet.
      code({ text }) {
        return text;
      },
      // Callouts façon GitHub : « > [!NOTE] », « > [!WARNING] »…
      blockquote(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, { tokens }) {
        const body = this.parser.parse(tokens as Tokens.Generic[]);
        const match = /^<p>\s*\[!(note|tip|important|warning|caution)\]\s*/i.exec(body);
        if (!match) return `<blockquote>${body}</blockquote>\n`;
        const meta = CALLOUTS[match[1].toLowerCase()];
        const rest = body.slice(match[0].length);
        const inner = rest.startsWith("</p>") ? rest.slice(4) : `<p>${rest}`;
        return `<div class="callout callout--${meta.kind}"><p class="callout-title">${meta.label}</p>${inner}</div>\n`;
      },
      // Les tables débordent sur mobile : on les rend défilables horizontalement.
      table(token) {
        const header = `<tr>${token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("")}</tr>`;
        const rows = token.rows
          .map((row) => `<tr>${row.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`)
          .join("");
        return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
      // Les liens externes s'ouvrent dans un nouvel onglet, sans fuite de referrer.
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//i.test(href);
        const attrs = [
          `href="${href}"`,
          title ? `title="${title}"` : "",
          external ? 'target="_blank" rel="noopener noreferrer"' : "",
        ].filter(Boolean).join(" ");
        return `<a ${attrs}>${text}</a>`;
      },
      image({ href, title, text }) {
        const attrs = [`src="${href}"`, `alt="${text ?? ""}"`, title ? `title="${title}"` : "", 'loading="lazy"']
          .filter(Boolean).join(" ");
        return `<img ${attrs} />`;
      },
    },
  });

  return marked;
}

const marked = createMarked();

export async function renderMarkdown(markdown: string): Promise<string> {
  const raw = await marked.parse(markdown ?? "");
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel", "loading", "style", "class", "checked", "disabled"],
  });
}

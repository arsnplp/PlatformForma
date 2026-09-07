// Contenu d'un ContentBlock selon son type (payload_json).
// Lecture défensive : ces données viennent de la base et d'anciennes versions.

export type TextPayload = { markdown: string };
export type FilePayload = { path: string; name: string; mimeType: string; sizeBytes: number; alt?: string; caption?: string };
export type EmbedPayload = { url: string; provider: "youtube" | "vimeo"; embedUrl: string; caption?: string };

const str = (o: Record<string, unknown>, k: string): string | undefined =>
  typeof o[k] === "string" ? (o[k] as string) : undefined;

function asObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

export function readText(payload: unknown): string {
  const o = asObject(payload);
  return o ? (str(o, "markdown") ?? "") : "";
}

export function readFile(payload: unknown): FilePayload | null {
  const o = asObject(payload);
  if (!o) return null;
  const path = str(o, "path"), name = str(o, "name"), mimeType = str(o, "mimeType");
  const sizeBytes = typeof o.sizeBytes === "number" ? o.sizeBytes : 0;
  if (!path || !name || !mimeType) return null;
  return { path, name, mimeType, sizeBytes, alt: str(o, "alt"), caption: str(o, "caption") };
}

export function readEmbed(payload: unknown): EmbedPayload | null {
  const o = asObject(payload);
  if (!o) return null;
  const url = str(o, "url"), embedUrl = str(o, "embedUrl"), provider = str(o, "provider");
  if (!url || !embedUrl || (provider !== "youtube" && provider !== "vimeo")) return null;
  return { url, provider, embedUrl, caption: str(o, "caption") };
}

// Seuls YouTube et Vimeo sont acceptés : on ne charge jamais une iframe arbitraire.
export function parseEmbedUrl(raw: string): EmbedPayload | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.searchParams.get("v");
    if (id && /^[\w-]{11}$/.test(id)) return { url: raw, provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    if (/^[\w-]{11}$/.test(id)) return { url: raw, provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return { url: raw, provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }
  return null;
}

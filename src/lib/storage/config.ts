// Fichiers de contenu (spec §2 : Supabase Storage, bucket privé, URLs signées).
export const CONTENT_BUCKET = "content";

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 Mo

// Types acceptés. Le SVG est volontairement exclu : il peut porter du script.
export const ALLOWED_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  pdf: ["application/pdf"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

export type FileKind = keyof typeof ALLOWED_TYPES;

export function kindOf(mimeType: string): FileKind | null {
  for (const [kind, list] of Object.entries(ALLOWED_TYPES) as [FileKind, readonly string[]][]) {
    if (list.includes(mimeType)) return kind;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Nom de fichier sûr : pas de chemin, pas d'accent, longueur bornée.
export function safeFileName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  return base.slice(-80).replace(/^-+/, "") || "fichier";
}

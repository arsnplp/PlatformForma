// Fichiers de contenu (spec §2 : Supabase Storage, bucket privé, URLs signées).
export const CONTENT_BUCKET = "content";

// Les livrables d'élèves vivent dans leur propre bucket : cycle de vie
// distinct (rétention RGPD), droits distincts (l'auteur et son formateur),
// et aucun risque de confusion avec les fichiers de contenu.
export const SUBMISSION_BUCKET = "submissions";

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 Mo

// Types acceptés. Le SVG est volontairement exclu : il peut porter du script.
export const ALLOWED_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  pdf: ["application/pdf"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

export type FileKind = keyof typeof ALLOWED_TYPES;

// Types acceptés pour un livrable : plus large que le contenu (bureautique,
// archives), toujours sans SVG ni exécutable.
export const SUBMISSION_TYPES: readonly string[] = [
  ...ALLOWED_TYPES.image,
  ...ALLOWED_TYPES.pdf,
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/zip",
];

export function isAllowedSubmissionType(mimeType: string): boolean {
  return SUBMISSION_TYPES.includes(mimeType);
}

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

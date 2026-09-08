// Fichiers de contenu (spec §2 : Supabase Storage, bucket privé, URLs signées).
export const CONTENT_BUCKET = "content";

// Les livrables d'élèves vivent dans leur propre bucket : cycle de vie
// distinct (rétention RGPD), droits distincts (l'auteur et son formateur),
// et aucun risque de confusion avec les fichiers de contenu.
export const SUBMISSION_BUCKET = "submissions";

// Les pièces du dossier (contrats, conventions, émargements, attestations)
// vivent à part : ce sont des preuves d'audit, avec leur propre durée de
// conservation et des droits plus stricts que les supports de cours.
export const DOCUMENT_BUCKET = "documents";

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
// On tronque la FIN du nom, pas le début — couper par la gauche transformait
// « Émargement… » en « argement… » — tout en gardant l'extension.
export function safeFileName(name: string): string {
  const clean = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  const dot = clean.lastIndexOf(".");
  const hasExtension = dot > 0 && clean.length - dot <= 6;
  const base = hasExtension ? clean.slice(0, dot) : clean;
  const extension = hasExtension ? clean.slice(dot) : "";
  return (base.slice(0, 80).replace(/^-+/, "").replace(/-+$/, "") + extension) || "fichier";
}

// Pièces de la GED : bureautique et PDF, jamais d'archive ni d'exécutable —
// une pièce de dossier doit s'ouvrir et se lire telle quelle.
export const DOCUMENT_TYPES: readonly string[] = [
  ...ALLOWED_TYPES.pdf,
  ...ALLOWED_TYPES.image,
  // Photos prises depuis un iPhone : le format par défaut d'iOS.
  "image/heic",
  "image/heif",
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
  "application/vnd.oasis.opendocument.presentation",
];

export function isAllowedDocumentType(mimeType: string): boolean {
  // Certains navigateurs ne devinent pas le type d'un fichier : plutôt que de
  // refuser un dépôt légitime, on laisse passer et c'est l'extension du nom
  // qui fera foi à l'ouverture.
  if (!mimeType) return true;
  return DOCUMENT_TYPES.includes(mimeType);
}

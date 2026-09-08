// Contenu du champ `attachments_json` d'un message.
//
// Ce champ portait déjà la trace de livraison des mails automatiques
// ({ kind, sentTo, sandbox }). Les pièces jointes s'y ajoutent sous la clé
// `files` sans rien écraser : lecture défensive des deux côtés.

export type MessageFile = { path: string; name: string; mimeType: string; sizeBytes: number };

export function readMessageFiles(attachments: unknown): MessageFile[] {
  if (!attachments || typeof attachments !== "object") return [];
  const files = (attachments as Record<string, unknown>).files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : null;
    const name = typeof o.name === "string" ? o.name : null;
    if (!path || !name) return [];
    return [{
      path,
      name,
      mimeType: typeof o.mimeType === "string" ? o.mimeType : "application/octet-stream",
      sizeBytes: typeof o.sizeBytes === "number" ? o.sizeBytes : 0,
    }];
  });
}

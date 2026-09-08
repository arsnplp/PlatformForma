import "server-only";

import { PDFDocument } from "pdf-lib";
import { getSignwellKey, isSignatureTest } from "./config";

// Client SignWell (API v1). Aucune dépendance : quelques appels REST.
const BASE = "https://www.signwell.com/api/v1";

type SignwellRecipient = {
  id: string;
  name: string;
  email: string;
  status: string;
  embedded_signing_url: string | null;
};

export type SignwellDocument = {
  id: string;
  name: string;
  status: string;
  test_mode: boolean;
  recipients: SignwellRecipient[];
};

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": getSignwellKey(),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
}

// Le champ de signature se pose en bas de la DERNIÈRE page, là où on signe un
// contrat. Pour un fichier qui n'est pas un PDF lisible, on retombe sur la
// première page plutôt que d'échouer.
async function signaturePlacement(file: Uint8Array): Promise<{ page: number; y: number }> {
  try {
    const pdf = await PDFDocument.load(file);
    const page = pdf.getPageCount();
    const { height } = pdf.getPage(page - 1).getSize();
    return { page, y: Math.max(80, Math.round(height - 170)) };
  } catch {
    return { page: 1, y: 640 };
  }
}

export async function createSignatureRequest(params: {
  title: string;
  fileName: string;
  file: Uint8Array;
  signer: { name: string; email: string };
  message: string;
}): Promise<{ ok: true; document: SignwellDocument } | { ok: false; error: string }> {
  const { page, y } = await signaturePlacement(params.file);

  const response = await call("/documents/", {
    method: "POST",
    body: JSON.stringify({
      // Deux barrières : test_mode retire toute valeur juridique, embedded_signing
      // empêche SignWell d'écrire lui-même au signataire.
      test_mode: isSignatureTest(),
      embedded_signing: true,
      draft: false,
      name: params.title,
      subject: params.title,
      message: params.message,
      files: [{ name: params.fileName, file_base64: Buffer.from(params.file).toString("base64") }],
      recipients: [{ id: "1", name: params.signer.name, email: params.signer.email }],
      fields: [[
        { api_id: "signature", type: "signature", recipient_id: "1", page, x: 60, y, required: true },
        { api_id: "date", type: "date", recipient_id: "1", page, x: 330, y, required: true },
      ]],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, error: `SignWell a refusé la demande (${response.status}) : ${detail.slice(0, 300)}` };
  }
  return { ok: true, document: (await response.json()) as SignwellDocument };
}

export async function getSignatureRequest(providerId: string): Promise<SignwellDocument | null> {
  const response = await call(`/documents/${providerId}/`);
  if (!response.ok) return null;
  return (await response.json()) as SignwellDocument;
}

// PDF signé, avec sa page de preuve (audit trail). Disponible seulement une
// fois toutes les signatures recueillies.
export async function downloadSignedPdf(providerId: string): Promise<Uint8Array | null> {
  const response = await call(`/documents/${providerId}/completed_pdf/?audit_page=true`);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteSignatureRequest(providerId: string): Promise<boolean> {
  const response = await call(`/documents/${providerId}/`, { method: "DELETE" });
  return response.ok;
}

// SignWell : "Completed" quand tout le monde a signé.
export const isCompleted = (status: string) => status.toLowerCase() === "completed";
export const isDeclined = (status: string) => status.toLowerCase() === "declined";

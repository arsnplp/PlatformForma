import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSignature } from "@/lib/actions/signature";

export const dynamic = "force-dynamic";

// Rappel de SignWell quand une signature avance. On ne fait AUCUNE confiance au
// contenu reçu : on en retient seulement l'identifiant, puis on redemande le
// statut à l'API avec notre clé. Un appel forgé ne peut donc rien affirmer.
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const providerId = extractDocumentId(payload);
  if (!providerId) return NextResponse.json({ ok: true, ignored: "aucun document identifiable" });

  const document = await prisma.document.findFirst({
    where: { signatureProviderId: providerId },
    select: { id: true },
  });
  if (!document) return NextResponse.json({ ok: true, ignored: "document inconnu" });

  const result = await syncSignature(document.id);
  return NextResponse.json({ ok: result.ok, message: result.message });
}

function extractDocumentId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as { data?: { object?: { id?: unknown } } }).data;
  const id = data?.object?.id;
  return typeof id === "string" ? id : null;
}

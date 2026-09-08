import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { checkDocumentAccess } from "@/lib/storage/access";
import { createReadUrl } from "@/lib/storage/client";
import { DOCUMENT_BUCKET } from "@/lib/storage/config";
import { logAccess } from "@/lib/audit";

// Accès à une pièce du dossier : jamais d'URL publique, jamais de fichier
// servi sans contrôle. On redirige vers une URL signée de 60 secondes,
// délivrée seulement si le demandeur a le droit de lire cette pièce.
export async function GET(request: Request, { params }: RouteContext<"/api/documents/[documentId]">) {
  const me = await getCurrentUser();
  if (!me) return new NextResponse("Non authentifié", { status: 401 });

  const { documentId } = await params;
  const access = await checkDocumentAccess(documentId, me);
  // Volontairement 404 et non 403 : on ne révèle pas l'existence de la pièce.
  if (!access.allowed) return new NextResponse("Introuvable", { status: 404 });

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { storagePath: true, title: true, mimeType: true },
  });
  if (!document) return new NextResponse("Introuvable", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const url = await createReadUrl(document.storagePath, {
    bucket: DOCUMENT_BUCKET,
    download: download ? document.title : undefined,
  });
  if (!url) return new NextResponse("Introuvable", { status: 404 });

  // Toute consultation d'une pièce de dossier est tracée (spec §12).
  await logAccess(me.id, "view_document", "document", documentId);

  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
}

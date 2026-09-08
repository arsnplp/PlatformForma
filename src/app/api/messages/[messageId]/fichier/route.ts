import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { checkConversationAccess } from "@/lib/queries/conversations";
import { createReadUrl } from "@/lib/storage/client";
import { MESSAGE_BUCKET } from "@/lib/storage/config";
import { readMessageFiles } from "@/lib/content/message-payload";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Seule porte d'accès aux pièces jointes d'une conversation.
// Les mêmes personnes que le fil lui-même : l'élève concerné et l'encadrement
// de sa session. Un autre élève de la même session obtient 404, comme un inconnu.
export async function GET(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, attachments: true },
  });
  if (!message) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const access = await checkConversationAccess(message.conversationId, me);
  // Volontairement 404 et non 403 : on ne révèle pas l'existence du fichier.
  if (!access.allowed) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const files = readMessageFiles(message.attachments);
  const index = Number(request.nextUrl.searchParams.get("i") ?? "0");
  const file = files[Number.isInteger(index) && index >= 0 ? index : 0];
  if (!file) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const signed = await createReadUrl(file.path, { bucket: MESSAGE_BUCKET, ...(download ? { download: file.name } : {}) });
  if (!signed) return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });

  const response = NextResponse.redirect(signed, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

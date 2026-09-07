import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { checkBlockFileAccess } from "@/lib/storage/access";
import { createReadUrl } from "@/lib/storage/client";
import { readFile } from "@/lib/content/block-payload";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Seule porte d'accès aux fichiers de contenu.
// Chaque requête : session obligatoire, droits vérifiés, puis redirection vers
// une URL signée valable 60 secondes. Rien n'est mis en cache partagé.
export async function GET(request: NextRequest, { params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const access = await checkBlockFileAccess(blockId, me);
  // Volontairement 404 et non 403 : on ne révèle pas l'existence du fichier.
  if (!access.allowed) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const block = await prisma.contentBlock.findUnique({ where: { id: blockId }, select: { payload: true } });
  const file = readFile(block?.payload);
  if (!file) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const signed = await createReadUrl(file.path, download ? { download: file.name } : {});
  if (!signed) return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });

  const response = NextResponse.redirect(signed, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

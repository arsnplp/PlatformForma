import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { checkSubmissionAccess } from "@/lib/storage/access";
import { createReadUrl } from "@/lib/storage/client";
import { SUBMISSION_BUCKET } from "@/lib/storage/config";
import { readSubmissionFiles } from "@/lib/content/submission-payload";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Seule porte d'accès aux livrables d'élèves.
// Auteur ou formateur de la session uniquement : un autre élève de la même
// session obtient 404, comme un inconnu.
export async function GET(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const access = await checkSubmissionAccess(submissionId, me);
  if (!access.allowed) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, select: { content: true } });
  const files = readSubmissionFiles(submission?.content);
  const index = Number(request.nextUrl.searchParams.get("i") ?? "0");
  const file = files[Number.isInteger(index) && index >= 0 ? index : 0];
  if (!file) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const signed = await createReadUrl(file.path, { bucket: SUBMISSION_BUCKET, ...(download ? { download: file.name } : {}) });
  if (!signed) return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });

  const response = NextResponse.redirect(signed, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

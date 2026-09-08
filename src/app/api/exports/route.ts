import { NextResponse, type NextRequest } from "next/server";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { collectPieces, streamDossier, type ExportScope } from "@/lib/export/dossier";
import { logAccess } from "@/lib/audit";

// Le ZIP est assemblé en flux : la route reste sur le runtime Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Téléchargement d'un dossier de preuve. Réservé à l'encadrement : un élève
// n'exporte pas de dossier, et personne n'exporte hors de son périmètre.
export async function GET(request: NextRequest) {
  const me = await requireUser();
  if (!hasPermission(me, "can_manage_sessions")) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const userId = params.get("eleve");
  const sessionId = params.get("session");

  const scope: ExportScope | null = userId
    ? { kind: "student", userId, sessionId: sessionId ?? undefined }
    : sessionId
      ? { kind: "session", sessionId }
      : null;
  if (!scope) return new NextResponse("Périmètre manquant", { status: 400 });

  let collected;
  try {
    collected = await collectPieces(scope, me);
  } catch {
    // Volontairement 404 : on ne dit pas si la session existe hors périmètre.
    return new NextResponse("Introuvable", { status: 404 });
  }

  // Chaque export est journalisé (spec §12) : qui a sorti quoi, et quand.
  await logAccess(
    me.id,
    scope.kind === "student" ? "export_dossier_eleve" : "export_dossier_session",
    scope.kind === "student" ? "user" : "session",
    scope.kind === "student" ? scope.userId : scope.sessionId,
    { dedupMinutes: 0 },
  );

  const stream = streamDossier({ ...collected, generatedBy: me.name });
  // Le préfixe « DEMONSTRATION_ » a été retiré à la demande : voir DEPLOIEMENT.md.
  const fileName = `${collected.fileName}.zip`;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

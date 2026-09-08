import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { getSessionResults, resultsToCsv } from "@/lib/queries/results";
import { logAccess } from "@/lib/audit";
import { safeFileName } from "@/lib/storage/config";

export const dynamic = "force-dynamic";

// Relevé de résultats d'une session, en CSV. Réservé à l'encadrement de CETTE
// session : un relevé de promo n'est pas une donnée d'élève.
export async function GET(request: NextRequest) {
  const me = await requireUser();
  if (!hasPermission(me, "can_manage_sessions")) return new NextResponse("Introuvable", { status: 404 });

  const sessionId = request.nextUrl.searchParams.get("session");
  if (!sessionId) return new NextResponse("Session manquante", { status: 400 });

  const scope = canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] };
  const session = await prisma.session.findFirst({
    where: { id: sessionId, ...scope },
    select: { id: true, name: true },
  });
  // Volontairement 404 : on ne dit pas si la session existe hors périmètre.
  if (!session) return new NextResponse("Introuvable", { status: 404 });

  const csv = resultsToCsv(await getSessionResults(session.id));
  await logAccess(me.id, "export_resultats_session", "session", session.id, { dedupMinutes: 0 });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(`Resultats - ${session.name}.csv`)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { runMessageNotifications } from "@/lib/notifications/message-notifications";
import { isSandbox } from "@/lib/mail/config";

export const dynamic = "force-dynamic";

// Passage fréquent (toutes les 15 min) : prévient par mail les destinataires
// qui n'ont pas lu leurs messages sur la plateforme. Même secret que le cron
// quotidien, et même garde-fou bac à sable que tout envoi.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 500 });

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (provided !== secret) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const report = await runMessageNotifications({ dryRun });

  return NextResponse.json({ ok: true, mode: isSandbox() ? "sandbox" : "production", ...report });
}

export const GET = handle;
export const POST = handle;

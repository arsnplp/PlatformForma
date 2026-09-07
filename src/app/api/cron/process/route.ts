import { NextResponse, type NextRequest } from "next/server";
import { runDueSteps } from "@/lib/process/run-due-steps";
import { isSandbox } from "@/lib/mail/config";

export const dynamic = "force-dynamic";

// Cron quotidien (à lancer vers 7h heure de Paris).
// Protégé par un secret : Authorization: Bearer $CRON_SECRET.
// Respecte le mode bac à sable comme tout envoi : tant que MAIL_MODE n'est pas
// « production », les mails partent vers la seule adresse de test.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 500 });

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (provided !== secret) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const summary = await runDueSteps({ trigger: "cron", dryRun });

  return NextResponse.json({ ok: true, mode: isSandbox() ? "sandbox" : "production", dryRun, ...summary });
}

export const GET = handle;
export const POST = handle;

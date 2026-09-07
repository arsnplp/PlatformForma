import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cible du lien d'invitation. Consomme le jeton à usage unique et ouvre une
// session, le temps que l'élève choisisse son mot de passe.
// Un lien expiré ou déjà utilisé ne dit pas si le compte existe.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const failed = new URL("/login?invitation=expiree", request.nextUrl.origin);
  if (!tokenHash) return NextResponse.redirect(failed);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error) return NextResponse.redirect(failed);

  return NextResponse.redirect(new URL("/activation", request.nextUrl.origin));
}

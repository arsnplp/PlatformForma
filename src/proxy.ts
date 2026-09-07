import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 : `proxy.ts` remplace `middleware.ts`.
// 1. Rafraîchit la session Supabase à chaque requête.
// 2. Redirige les non-connectés vers /login (sauf routes publiques).
// L'autorisation fine (permissions) se fait dans les layouts / actions serveur.
const PUBLIC_PATHS = ["/", "/login"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Les routes API portent leur propre authentification (secret du cron,
  // session applicative…) et doivent répondre 401, jamais une redirection HTML.
  const isApi = pathname.startsWith("/api/");
  const isPublic = isApi || PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};

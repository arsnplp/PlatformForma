import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

// Rafraîchit la session Supabase à chaque requête (appelé depuis src/proxy.ts).
// Les cookies mis à jour sont recopiés sur la requête ET la réponse, pour que
// les Server Components voient déjà la session rafraîchie.
// Aucune règle de redirection ici : l'autorisation (étape 3) s'appuiera sur
// l'utilisateur retourné.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Indispensable : déclenche le refresh du token avant tout rendu.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Les réponses qui touchent à l'auth ne doivent jamais être mises en cache.
  response.headers.set("Cache-Control", "private, no-store");

  return { response, user };
}

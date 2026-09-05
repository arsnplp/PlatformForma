import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

// Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
// Lit et écrit la session dans les cookies de la requête courante.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Appelé depuis un Server Component : impossible d'écrire les cookies ici.
          // Sans gravité : le proxy (src/proxy.ts) rafraîchit la session à chaque requête.
        }
      },
    },
  });
}

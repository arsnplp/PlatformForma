import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client Supabase avec la clé service_role : contourne le RLS.
// À n'utiliser QUE côté serveur, pour l'administration (création de comptes,
// seed, tâches de fond). Jamais importé dans du code client (import "server-only").
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante dans l'environnement",
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

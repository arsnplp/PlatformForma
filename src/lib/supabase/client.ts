"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

// Client Supabase côté navigateur (Client Components).
// La session est stockée en cookies, lisible ensuite par le serveur.
export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}

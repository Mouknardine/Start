import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase « service role » — contourne la RLS.
 *
 * ⚠️ Serveur uniquement (API routes, Server Components). Ne jamais importer
 * depuis un composant client : la clé serait exposée dans le bundle.
 *
 * Renvoie null si les variables d'environnement manquent, pour laisser
 * l'appelant décider (erreur 500 explicite, ou mode dégradé).
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

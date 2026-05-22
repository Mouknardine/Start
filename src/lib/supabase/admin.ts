import { createClient } from '@/lib/supabase/server'

/**
 * Vérifie côté serveur si l'utilisateur courant est admin.
 * Utilise la fonction Postgres public.is_admin() qui consulte la table admins.
 * Renvoie un objet { isAdmin, userId, email } pour faciliter l'usage.
 */
export async function checkAdminAccess() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return { isAdmin: false, userId: null, email: null }
  }

  const { data, error } = await supabase.rpc('is_admin')
  if (error) {
    return { isAdmin: false, userId: user.id, email: user.email || null }
  }

  return {
    isAdmin: Boolean(data),
    userId: user.id,
    email: user.email || null,
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-redirect'

/**
 * GET /auth/callback?code=...&next=/path
 *
 * Endpoint de callback pour les flows Supabase Auth nécessitant un lien
 * email :
 *  - Vérification d'email à l'inscription
 *  - Reset password
 *  - Magic link
 *  - OAuth (Google, etc.)
 *
 * Échange le code temporaire contre une session, puis redirige vers
 * la page demandée (ou /dashboard par défaut).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // Anti open-redirect : seuls les chemins internes sont acceptés (voir safeNextPath)
  const next = safeNextPath(url.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/connexion?error=missing_code', url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(`/connexion?error=${encodeURIComponent(error.message)}`, url.origin)
    )
  }

  return NextResponse.redirect(new URL(next, url.origin))
}

import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { accountActionLimiter, getClientKey } from '@/lib/rate-limit'

/**
 * DELETE /api/account/delete
 *
 * Supprime totalement le compte de l'utilisateur connecté.
 *
 * Body JSON requis : { password: string }
 *   Le mot de passe est revérifié côté serveur pour éviter qu'un XSS ou
 *   un CSRF puisse provoquer la suppression depuis une page tierce.
 *
 * Flow (R5 — audit du 22 mai 2026) :
 *   1. Vérif session via getUser()
 *   2. Vérif mot de passe via signInWithPassword sur un client temporaire
 *      (n'écrase pas la session active)
 *   3. RPC delete_my_account() — transaction atomique côté DB qui purge
 *      toutes les données métier + écrit l'audit log
 *   4. Cleanup storage (artisan-media/{userId}/) — best effort
 *   5. admin.auth.admin.deleteUser(userId) — supprime auth.users
 *   6. signOut de la session courante
 *
 * Pré-requis : SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY en env vars.
 */
export async function DELETE(request: Request) {
  // 1. Rate limit (3 tentatives/min/IP)
  const { allowed, retryAfterSec } = accountActionLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de requêtes. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  // 2. Auth check (session côté serveur)
  const supabase = await createServerSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user || !user.email) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // 3. Lecture du body — password requis
  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  if (typeof body.password !== 'string' || body.password.length < 1) {
    return NextResponse.json(
      { error: 'Mot de passe requis pour confirmer la suppression.' },
      { status: 400 },
    )
  }

  // 4. Vérification env vars
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!serviceRoleKey || !supabaseUrl || !anonKey) {
    logger.error('Variables Supabase manquantes (URL/ANON/SERVICE_ROLE)')
    return NextResponse.json(
      { error: 'Configuration serveur incomplète' },
      { status: 500 },
    )
  }

  // 5. Re-vérification du mot de passe via un client ANON temporaire qui
  //    ne persiste rien (sinon la session de l'API serait écrasée).
  const verifier = createAdminClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: pwdErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: body.password,
  })
  if (pwdErr) {
    logger.warn('Tentative suppression compte : mot de passe erroné', {
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Mot de passe incorrect.' },
      { status: 401 },
    )
  }

  // 6. RPC transactionnelle — purge atomique des données métier
  //    (audit log écrit dans la même transaction côté DB).
  const { error: rpcErr } = await supabase.rpc('delete_my_account')
  if (rpcErr) {
    logger.error('delete_my_account RPC error:', rpcErr)
    return NextResponse.json(
      { error: 'Suppression des données échouée' },
      { status: 500 },
    )
  }

  // 7. Cleanup storage — best effort, ne bloque pas si ça échoue.
  //    Si l'artisan a des avatars/galeries, ils sont stockés sous {userId}/.
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const { data: files } = await admin.storage
      .from('artisan-media')
      .list(user.id)
    if (files && files.length > 0) {
      await admin.storage
        .from('artisan-media')
        .remove(files.map(f => `${user.id}/${f.name}`))
    }
  } catch (e) {
    logger.warn('Cleanup storage échec (non bloquant):', e)
  }

  // 8. Suppression du compte auth Supabase
  const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(user.id)
  if (deleteAuthErr) {
    logger.error('Erreur suppression auth user:', deleteAuthErr)
    // Données métier déjà purgées + audit log écrit. Le user existe
    // encore côté auth mais n'a plus aucune donnée. Il peut réessayer
    // ou contacter le support pour finaliser.
    return NextResponse.json(
      {
        error:
          'Données supprimées mais le compte auth n\'a pas pu être effacé. ' +
          'Contactez le support pour finaliser.',
      },
      { status: 500 },
    )
  }

  // 9. Déconnexion de la session courante
  await supabase.auth.signOut()

  return NextResponse.json({ success: true })
}

import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { accountActionLimiter, getClientKey } from '@/lib/rate-limit'

/**
 * DELETE /api/account/delete
 *
 * Supprime totalement le compte de l'utilisateur connecté :
 *  - Toutes ses données métier (demandes, avis, prestations, documents, etc.)
 *  - Le compte auth Supabase lui-même (via le service role)
 *
 * L'utilisateur est identifié à partir de la session côté serveur.
 *
 * Pré-requis : la variable d'env SUPABASE_SERVICE_ROLE_KEY doit être définie
 * (clé service role, JAMAIS exposée côté client).
 */
export async function DELETE(request: Request) {
  // Rate limit : max 3 tentatives/min par IP pour éviter le bruteforce
  const { allowed, retryAfterSec } = accountActionLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de requêtes. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const supabase = await createServerSupabase()

  // 1. Vérifier la session côté serveur
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const userId = user.id
  const email = user.email || ''

  // 2. Service role client (bypass RLS pour suppression auth)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) {
    logger.error('SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL absente')
    return NextResponse.json(
      { error: 'Configuration serveur incomplète' },
      { status: 500 }
    )
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // 3. Détecter si l'utilisateur est artisan (présence dans la table artisans)
    const { data: artisanRow } = await admin
      .from('artisans')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    const isArtisanUser = !!artisanRow

    // 4. Suppression des données métier
    if (isArtisanUser) {
      // Côté artisan : nettoyer toutes les tables liées
      await admin.from('messages').delete()
        .in('demande_id',
          (await admin.from('demandes').select('id').eq('artisan_id', userId)).data?.map(d => d.id) || []
        )
      await admin.from('affectations').delete().eq('artisan_id', userId)
      await admin.from('employes').delete().eq('artisan_id', userId)
      await admin.from('documents').delete().eq('artisan_id', userId)
      await admin.from('prestations').delete().eq('artisan_id', userId)
      await admin.from('demandes').delete().eq('artisan_id', userId)
      await admin.from('avis').delete().eq('artisan_id', userId)
      await admin.from('artisans').delete().eq('id', userId)

      // Vider le storage de l'artisan
      try {
        const { data: files } = await admin.storage.from('artisan-media').list(userId)
        if (files && files.length > 0) {
          await admin.storage.from('artisan-media').remove(files.map(f => `${userId}/${f.name}`))
        }
      } catch (e) {
        logger.warn('Cleanup storage échec (non bloquant):', e)
      }
    } else if (email) {
      // Côté client : supprimer demandes, avis, et messages liés à ses demandes
      const { data: clientDemandes } = await admin
        .from('demandes')
        .select('id')
        .eq('client_email', email)
      const demandeIds = clientDemandes?.map(d => d.id) || []
      if (demandeIds.length > 0) {
        await admin.from('messages').delete().in('demande_id', demandeIds)
      }
      await admin.from('demandes').delete().eq('client_email', email)
      await admin.from('avis').delete().eq('client_email', email)
    }

    // 5. Suppression du compte auth Supabase
    const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteAuthErr) {
      logger.error('Erreur suppression auth user:', deleteAuthErr)
      return NextResponse.json(
        { error: 'Suppression auth échouée' },
        { status: 500 }
      )
    }

    // 6. Déconnexion de la session courante
    await supabase.auth.signOut()

    return NextResponse.json({ success: true })
  } catch (e) {
    logger.error('Erreur suppression compte:', e)
    return NextResponse.json(
      { error: 'Erreur interne durant la suppression' },
      { status: 500 }
    )
  }
}

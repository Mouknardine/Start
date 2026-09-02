import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { accountActionLimiter, getClientKey } from '@/lib/rate-limit'

/**
 * GET /api/account/export
 *
 * Renvoie un JSON avec toutes les données personnelles de l'utilisateur
 * connecté (droit d'accès / portabilité RGPD art. 15 et 20).
 *
 * Le navigateur déclenche un téléchargement (Content-Disposition).
 */
export async function GET(request: Request) {
  // Rate limit pour éviter le scraping massif
  const { allowed, retryAfterSec } = await accountActionLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de requêtes. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const userId = user.id
  const email = user.email || ''

  try {
    // 1. Compte (auth) — on ne renvoie que les champs publics
    const account = {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      provider: user.app_metadata?.provider,
    }

    // 2. Profil artisan (si applicable)
    const { data: artisan } = await supabase
      .from('artisans')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    // 3. Demandes : émises (en tant que client) + reçues (en tant qu'artisan)
    const [demandesRecues, demandesEmises] = await Promise.all([
      supabase.from('demandes').select('*').eq('artisan_id', userId),
      email ? supabase.from('demandes').select('*').eq('client_email', email) : Promise.resolve({ data: [] }),
    ])

    // 4. Avis : reçus (en tant qu'artisan) + laissés (en tant que client)
    const [avisRecus, avisLaisses] = await Promise.all([
      supabase.from('avis').select('*').eq('artisan_id', userId),
      email ? supabase.from('avis').select('*').eq('client_email', email) : Promise.resolve({ data: [] }),
    ])

    // 5. Messages : tous ceux où l'utilisateur a participé
    const allDemandeIds = [
      ...(demandesRecues.data || []).map((d) => d.id),
      ...(demandesEmises.data || []).map((d) => d.id),
    ]
    const messages = allDemandeIds.length > 0
      ? (await supabase.from('messages').select('*').in('demande_id', allDemandeIds)).data || []
      : []

    // 6. Données artisan métier (équipe, prestations, documents, agenda)
    let employes: unknown[] = []
    let affectations: unknown[] = []
    let prestations: unknown[] = []
    let documents: unknown[] = []
    if (artisan) {
      const [emp, aff, prest, doc] = await Promise.all([
        supabase.from('employes').select('*').eq('artisan_id', userId),
        supabase.from('affectations').select('*').eq('artisan_id', userId),
        supabase.from('prestations').select('*').eq('artisan_id', userId),
        supabase.from('documents').select('*').eq('artisan_id', userId),
      ])
      employes = emp.data || []
      affectations = aff.data || []
      prestations = prest.data || []
      documents = doc.data || []
    }

    const exportPayload = {
      generated_at: new Date().toISOString(),
      legal_basis: 'RGPD art. 15 et 20 — Droit d\'accès et portabilité',
      account,
      profil_artisan: artisan,
      demandes_recues: demandesRecues.data || [],
      demandes_emises: demandesEmises.data || [],
      avis_recus: avisRecus.data || [],
      avis_laisses: avisLaisses.data || [],
      messages,
      employes,
      affectations,
      prestations,
      documents,
    }

    const json = JSON.stringify(exportPayload, null, 2)
    const filename = `artisano-export-${new Date().toISOString().slice(0, 10)}.json`

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    logger.error('Erreur export RGPD:', e)
    return NextResponse.json(
      { error: 'Erreur durant l\'export' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { demandeSchema, parsePayload } from '@/lib/validation/schemas'
import { createLimiter, getClientKey } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/email/resend'
import { newDemandeEmail } from '@/lib/email/templates'

// Max 10 demandes par heure par IP — protège contre le spam
const demandeLimiter = createLimiter({
  name: 'demande-create',
  windowMs: 60 * 60 * 1000,
  max: 10,
})

/**
 * POST /api/demandes
 * Crée une demande après validation Zod + rate limit.
 * RLS Supabase fait une 2ᵉ couche de sécurité.
 */
export async function POST(request: Request) {
  // Rate limit
  const { allowed, retryAfterSec } = await demandeLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de demandes. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  // Parse JSON
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  // Validation Zod
  const parsed = parsePayload(demandeSchema, payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // Le client_email n'est jamais pris du body : c'est l'email de session.
  // (Sinon n'importe qui pourrait créer des demandes au nom d'un tiers, qui
  // les verrait ensuite apparaître dans son espace client.) La policy RLS
  // demandes_insert_client impose la même règle en 2ᵉ couche.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Connectez-vous pour envoyer une demande.' }, { status: 401 })
  }

  const { data: created, error: dbErr } = await supabase
    .from('demandes')
    .insert({ ...parsed.data, client_email: user.email, statut: 'nouvelle' })
    .select('id')
    .single()

  if (dbErr) {
    logger.error('Erreur création demande:', dbErr)
    return NextResponse.json({ error: 'Création échouée' }, { status: 500 })
  }

  // Notification email à l'artisan — envoyée ici côté serveur (fiable même
  // si le client ferme l'onglet). Best effort : ne bloque pas la création.
  try {
    const { data: artisan } = await supabase
      .from('artisans_public')
      .select('prenom, email, metier')
      .eq('id', parsed.data.artisan_id)
      .maybeSingle<{ prenom: string; email: string; metier: string }>()

    if (artisan?.email) {
      const { subject, html } = newDemandeEmail({
        artisanPrenom: artisan.prenom || 'Artisan',
        clientNom: parsed.data.client_nom || 'Un client',
        metier: artisan.metier,
        type: parsed.data.type,
        messagePreview: parsed.data.message || '',
        demandeId: created.id,
      })
      await sendEmail({ to: artisan.email, subject, html })
    }
  } catch (e) {
    logger.warn('Notification email demande échouée (non bloquant):', e)
  }

  return NextResponse.json({ id: created.id })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { demandeSchema, parsePayload } from '@/lib/validation/schemas'
import { createLimiter, getClientKey } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

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
  const { allowed, retryAfterSec } = demandeLimiter.check(getClientKey(request))
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

  // Insertion via le client server (passe par RLS — sera bloqué si abus)
  const supabase = await createClient()
  const { data: created, error: dbErr } = await supabase
    .from('demandes')
    .insert({ ...parsed.data, statut: 'nouvelle' })
    .select('id')
    .single()

  if (dbErr) {
    logger.error('Erreur création demande:', dbErr)
    return NextResponse.json({ error: 'Création échouée' }, { status: 500 })
  }

  return NextResponse.json({ id: created.id })
}

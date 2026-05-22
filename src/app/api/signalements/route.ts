import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parsePayload } from '@/lib/validation/schemas'
import { createLimiter, getClientKey } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Max 5 signalements par heure par IP (anti-spam et flood admin)
const signalementLimiter = createLimiter({
  name: 'signalement-create',
  windowMs: 60 * 60 * 1000,
  max: 5,
})

const signalementSchema = z.object({
  cible_type: z.enum(['avis', 'artisan', 'demande']),
  cible_id: z.string().uuid(),
  raison: z.string().trim().min(3, 'Raison trop courte').max(100),
  details: z.string().trim().max(2000).optional().default(''),
})

/**
 * POST /api/signalements
 * Crée un signalement sur un avis ou un profil artisan.
 */
export async function POST(request: Request) {
  const { allowed, retryAfterSec } = signalementLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de signalements. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const parsed = parsePayload(signalementSchema, payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    const { error } = await supabase.from('signalements').insert({
      ...parsed.data,
      reporter_id: user.id,
      reporter_email: user.email,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    logger.error('Erreur signalement:', e)
    return NextResponse.json({ error: 'Erreur création signalement' }, { status: 500 })
  }
}

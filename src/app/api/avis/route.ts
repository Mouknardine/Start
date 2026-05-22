import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { avisSchema, parsePayload } from '@/lib/validation/schemas'
import { createLimiter, getClientKey } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Max 5 avis par heure par IP
const avisLimiter = createLimiter({
  name: 'avis-create',
  windowMs: 60 * 60 * 1000,
  max: 5,
})

/**
 * POST /api/avis
 * Crée un avis après validation. Vérifie aussi qu'une demande
 * terminée existe entre le client et l'artisan.
 */
export async function POST(request: Request) {
  const { allowed, retryAfterSec } = avisLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop d'avis. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const parsed = parsePayload(avisSchema, payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = await createClient()

  // R3 (audit 22/05/2026) : l'API ne doit jamais faire confiance au client_email
  // du body. On exige que l'utilisateur soit authentifié ET que son email de
  // session corresponde au client_email payload — sinon IDOR (un user pourrait
  // écrire un avis au nom d'un autre client).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  if (user.email.toLowerCase() !== parsed.data.client_email.toLowerCase()) {
    return NextResponse.json(
      { error: 'L\'email de l\'avis doit correspondre à votre compte.' },
      { status: 403 },
    )
  }

  // Vérifier que le client a bien une demande terminée avec cet artisan
  const { data: hasCompleted } = await supabase.rpc('check_completed_demande', {
    p_artisan_id: parsed.data.artisan_id,
    p_client_email: parsed.data.client_email,
  })
  if (!hasCompleted) {
    return NextResponse.json(
      { error: 'Vous devez avoir une intervention terminée avec cet artisan pour laisser un avis.' },
      { status: 403 }
    )
  }

  const { data: created, error: dbErr } = await supabase
    .from('avis')
    .insert(parsed.data)
    .select('id')
    .single()

  if (dbErr) {
    logger.error('Erreur création avis:', dbErr)
    return NextResponse.json({ error: 'Création échouée' }, { status: 500 })
  }

  return NextResponse.json({ id: created.id })
}

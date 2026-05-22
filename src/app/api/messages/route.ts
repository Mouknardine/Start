import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { messageSchema, parsePayload } from '@/lib/validation/schemas'
import { createLimiter, getClientKey } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Max 60 messages par minute par IP (chat actif autorisé)
const messageLimiter = createLimiter({
  name: 'message-create',
  windowMs: 60 * 1000,
  max: 60,
})

/**
 * POST /api/messages
 * Envoie un message dans une demande. RLS vérifie que l'expéditeur est
 * bien un participant. On déduit le sender_type côté serveur (artisan
 * si auth.uid() = demande.artisan_id, sinon client).
 */
export async function POST(request: Request) {
  const { allowed, retryAfterSec } = messageLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de messages. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const parsed = parsePayload(messageSchema, payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Déduire le sender_type côté serveur (ne pas faire confiance au client)
  const { data: demande } = await supabase
    .from('demandes')
    .select('artisan_id, client_email')
    .eq('id', parsed.data.demande_id)
    .single<{ artisan_id: string; client_email: string }>()

  if (!demande) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  }

  let senderType: 'artisan' | 'client'
  if (demande.artisan_id === user.id) senderType = 'artisan'
  else if (demande.client_email === user.email) senderType = 'client'
  else {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { data: created, error: dbErr } = await supabase
    .from('messages')
    .insert({
      demande_id: parsed.data.demande_id,
      sender_type: senderType,
      sender_id: senderType === 'artisan' ? user.id : (user.email || ''),
      content: parsed.data.content,
    })
    .select('id')
    .single()

  if (dbErr) {
    logger.error('Erreur création message:', dbErr)
    return NextResponse.json({ error: 'Envoi échoué' }, { status: 500 })
  }

  return NextResponse.json({ id: created.id })
}

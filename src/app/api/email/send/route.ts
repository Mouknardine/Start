import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend'
import {
  newDemandeEmail,
  newMessageEmail,
  demandeStatusEmail,
  welcomeArtisanEmail,
  welcomeClientEmail,
} from '@/lib/email/templates'
import { logger } from '@/lib/logger'
import { emailLimiter, getClientKey } from '@/lib/rate-limit'

/**
 * POST /api/email/send
 *
 * Endpoint interne qui déclenche un email en fonction d'un événement métier.
 * Le payload contient le type d'événement et les IDs nécessaires — le
 * serveur recharge les données pour éviter qu'un client malicieux envoie
 * du contenu arbitraire à n'importe quelle adresse.
 *
 * Types supportés :
 *  - "new_demande"   : { demandeId }   → notif artisan
 *  - "new_message"   : { messageId }   → notif destinataire
 *  - "demande_status": { demandeId }   → notif client (acceptee/refusee/terminee)
 *  - "welcome_artisan": rien (basé sur session)
 *  - "welcome_client": rien (basé sur session)
 */
export async function POST(request: Request) {
  // Rate limit : max 10 emails/min par IP
  const { allowed, retryAfterSec } = await emailLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop d'emails envoyés. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let payload: { type: string; demandeId?: string; messageId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const { type } = payload

  try {
    if (type === 'new_demande' && payload.demandeId) {
      return await handleNewDemande(payload.demandeId)
    }
    if (type === 'new_message' && payload.messageId) {
      return await handleNewMessage(payload.messageId)
    }
    if (type === 'demande_status' && payload.demandeId) {
      return await handleDemandeStatus(payload.demandeId)
    }
    if (type === 'welcome_artisan') {
      return await handleWelcomeArtisan(user.id)
    }
    if (type === 'welcome_client') {
      return await handleWelcomeClient(user.email || '', user.user_metadata?.prenom)
    }

    return NextResponse.json({ error: 'Type inconnu' }, { status: 400 })
  } catch (e) {
    logger.error('Email API error:', e)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

async function handleNewDemande(demandeId: string) {
  const supabase = await createClient()
  const { data: demande } = await supabase
    .from('demandes')
    .select('id, type, message, client_nom, artisans(prenom, email, entreprise, metier)')
    .eq('id', demandeId)
    .single<{
      id: string; type: string; message: string; client_nom: string
      artisans: { prenom: string; email: string; entreprise: string; metier: string } | null
    }>()

  if (!demande || !demande.artisans?.email) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  }

  const { subject, html } = newDemandeEmail({
    artisanPrenom: demande.artisans.prenom || 'Artisan',
    clientNom: demande.client_nom || 'Un client',
    metier: demande.artisans.metier,
    type: demande.type,
    messagePreview: demande.message || '',
    demandeId: demande.id,
  })

  const res = await sendEmail({ to: demande.artisans.email, subject, html })
  return NextResponse.json(res)
}

async function handleNewMessage(messageId: string) {
  const supabase = await createClient()
  const { data: msg } = await supabase
    .from('messages')
    .select('id, sender_type, content, demandes(id, client_email, client_nom, artisans(email, prenom, entreprise))')
    .eq('id', messageId)
    .single<{
      id: string; sender_type: 'client' | 'artisan'; content: string
      demandes: {
        id: string; client_email: string; client_nom: string
        artisans: { email: string; prenom: string; entreprise: string } | null
      } | null
    }>()

  if (!msg || !msg.demandes) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })
  }

  const recipientType = msg.sender_type === 'client' ? 'artisan' : 'client'
  const recipientEmail = recipientType === 'artisan'
    ? msg.demandes.artisans?.email
    : msg.demandes.client_email
  const recipientName = recipientType === 'artisan'
    ? (msg.demandes.artisans?.prenom || 'Artisan')
    : (msg.demandes.client_nom || 'Client')
  const senderName = msg.sender_type === 'client'
    ? msg.demandes.client_nom || 'Le client'
    : (msg.demandes.artisans?.entreprise || msg.demandes.artisans?.prenom || 'L\'artisan')

  if (!recipientEmail) {
    return NextResponse.json({ error: 'Destinataire sans email' }, { status: 404 })
  }

  const { subject, html } = newMessageEmail({
    recipientName,
    senderName,
    senderType: msg.sender_type,
    messagePreview: msg.content,
    demandeId: msg.demandes.id,
    recipientType,
  })

  const res = await sendEmail({ to: recipientEmail, subject, html })
  return NextResponse.json(res)
}

async function handleDemandeStatus(demandeId: string) {
  const supabase = await createClient()
  const { data: demande } = await supabase
    .from('demandes')
    .select('id, statut, client_nom, client_email, artisans(entreprise, prenom, nom)')
    .eq('id', demandeId)
    .single<{
      id: string; statut: string; client_nom: string; client_email: string
      artisans: { entreprise: string; prenom: string; nom: string } | null
    }>()

  if (!demande || !demande.client_email) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  }

  if (!['acceptee', 'refusee', 'terminee'].includes(demande.statut)) {
    return NextResponse.json({ skipped: true })
  }

  const artisanName = demande.artisans?.entreprise
    || `${demande.artisans?.prenom || ''} ${demande.artisans?.nom || ''}`.trim()
    || 'L\'artisan'

  const { subject, html } = demandeStatusEmail({
    clientNom: demande.client_nom || 'Client',
    artisanName,
    newStatus: demande.statut as 'acceptee' | 'refusee' | 'terminee',
    demandeId: demande.id,
  })

  const res = await sendEmail({ to: demande.client_email, subject, html })
  return NextResponse.json(res)
}

async function handleWelcomeArtisan(userId: string) {
  const supabase = await createClient()
  const { data: artisan } = await supabase
    .from('artisans')
    .select('prenom, email')
    .eq('id', userId)
    .single()

  if (!artisan?.email) {
    return NextResponse.json({ error: 'Artisan sans email' }, { status: 404 })
  }

  const { subject, html } = welcomeArtisanEmail({ prenom: artisan.prenom || 'Artisan' })
  const res = await sendEmail({ to: artisan.email, subject, html })
  return NextResponse.json(res)
}

async function handleWelcomeClient(email: string, prenom?: string) {
  if (!email) return NextResponse.json({ error: 'Email manquant' }, { status: 400 })
  const { subject, html } = welcomeClientEmail({ prenom: prenom || 'Bienvenue' })
  const res = await sendEmail({ to: email, subject, html })
  return NextResponse.json(res)
}

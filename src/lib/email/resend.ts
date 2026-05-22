import { Resend } from 'resend'
import { logger } from '@/lib/logger'

/**
 * Client Resend partagé. Lazy-instancié pour ne pas crasher au build
 * si la clé n'est pas définie en dev local.
 */
let _resend: Resend | null = null

function getResend(): Resend | null {
  if (_resend) return _resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    logger.warn('RESEND_API_KEY absente — les emails ne seront pas envoyés')
    return null
  }
  _resend = new Resend(apiKey)
  return _resend
}

// Adresse "from" par défaut. Doit correspondre à un domaine vérifié dans Resend.
// Pour le dev avant vérif domaine, on peut utiliser onboarding@resend.dev qui marche.
export const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'Artisano <onboarding@resend.dev>'

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  from?: string
}

/**
 * Envoie un email via Resend. N'échoue jamais : log l'erreur et retourne
 * { success: false } pour qu'un email manqué ne casse pas une demande.
 */
export async function sendEmail({
  to, subject, html, text, replyTo, from,
}: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const resend = getResend()
  if (!resend) {
    return { success: false, error: 'Resend non configuré' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: from || DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      replyTo,
    })

    if (error) {
      logger.error('Resend send error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (e) {
    logger.error('Resend exception:', e)
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

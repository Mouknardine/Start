import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifierLienDocument } from '@/lib/document-link'
import { accountActionLimiter, getClientKey } from '@/lib/rate-limit'
import { todayISO } from '@/lib/facturation'

/**
 * POST /f/:token/accepter — le client accepte le devis depuis le lien reçu.
 * Le devis passe « accepté » : l'artisan le retrouve dans « À traiter » et
 * crée la facture en un geste.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const retour = NextResponse.redirect(new URL(`/f/${token}?accepte=1`, request.url), 303)
  const { allowed } = await accountActionLimiter.check(`devis:${getClientKey(request)}`)
  if (!allowed) return NextResponse.redirect(new URL(`/f/${token}`, request.url), 303)

  const id = verifierLienDocument(token)
  const admin = createServiceClient()
  if (!id || !admin) return NextResponse.redirect(new URL(`/f/${token}`, request.url), 303)

  const { data: doc } = await admin.from('documents').select('id, type, statut').eq('id', id).maybeSingle()
  if (!doc || doc.type !== 'devis') return NextResponse.redirect(new URL(`/f/${token}`, request.url), 303)
  if (doc.statut === 'envoye' || doc.statut === 'brouillon') {
    await admin.from('documents').update({ statut: 'accepte', date_acceptation: todayISO() }).eq('id', id)
  }
  return retour
}

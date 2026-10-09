import { NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signerLienDocument } from '@/lib/document-link'

/**
 * POST /api/documents/:id/lien
 * Renvoie le lien de partage d'un devis / d'une facture de l'artisan connecté.
 * La lecture passe par la session (RLS) : impossible d'obtenir le lien d'un
 * document qui n'est pas le sien.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: doc } = await supabase.from('documents').select('id, artisan_id').eq('id', id).maybeSingle()
  if (!doc || doc.artisan_id !== user.id) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

  // La page publique lit le document avec la clé service : sans elle, pas de lien.
  const token = createServiceClient() ? signerLienDocument(id) : null
  if (!token) return NextResponse.json({ error: 'Le partage par lien n’est pas configuré sur ce serveur.' }, { status: 503 })

  return NextResponse.json({ url: `${new URL(request.url).origin}/f/${token}` })
}

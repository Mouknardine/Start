import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * GET /api/localites?q=yver
 *
 * Autocomplétion des localités suisses (référentiel swisstopo, migration
 * 0014/0015). Données publiques et stables → client anon sans cookies,
 * réponse cachée au CDN 24 h.
 *
 * Réponse : { items: { nom, npa, canton, commune }[] }
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60)
  if (q.length < 1) {
    return NextResponse.json({ items: [] })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Configuration serveur incomplète' }, { status: 500 })
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.rpc('search_localites', { p_q: q, p_limit: 8 })
    if (error) throw error

    return NextResponse.json(
      { items: data || [] },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    )
  } catch (e) {
    logger.error('Erreur search localites:', e)
    return NextResponse.json({ error: 'Erreur recherche localités' }, { status: 500 })
  }
}

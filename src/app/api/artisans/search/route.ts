import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * GET /api/artisans/search?metier=X&ville=Y&canton=VD&urgence=1&noteMin=4
 *                         &page=0&pageSize=20&sort=pertinence|meilleure-note|plus-avis
 *
 * Toute la recherche se fait côté DB via la RPC search_artisans (migration
 * 0014) : normalisation (accents, casse), agrégation des avis, tri et
 * pagination — le tri par note est donc correct sur l'ensemble des résultats,
 * pas seulement sur la page courante.
 *
 * Réponse : { items: Artisan[], total: number, page: number, pageSize: number }
 * Chaque item porte avg_note / nb_avis, et les alias _avg / _count attendus
 * par la page /recherche.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const metier = (url.searchParams.get('metier') || '').trim().slice(0, 100)
  const ville = (url.searchParams.get('ville') || '').trim().slice(0, 100)
  const canton = (url.searchParams.get('canton') || '').trim().slice(0, 2)
  const urgence = url.searchParams.get('urgence') === '1'
  const noteMin = Math.min(5, Math.max(0, Number(url.searchParams.get('noteMin') || '0') || 0))
  const page = Math.max(0, Math.floor(Number(url.searchParams.get('page') || '0') || 0))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get('pageSize') || '20') || 20)))
  const sortParam = url.searchParams.get('sort') || 'pertinence'
  const sort = ['pertinence', 'meilleure-note', 'plus-avis'].includes(sortParam) ? sortParam : 'pertinence'

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('search_artisans', {
      p_metier: metier || null,
      p_ville: ville || null,
      p_canton: canton || null,
      p_urgence: urgence,
      p_note_min: noteMin,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    })
    if (error) throw error

    type Row = { item: Record<string, unknown>; total_count: number | string }
    const rows = (data || []) as Row[]
    const items = rows.map(({ item }) => ({
      ...item,
      _avg: Number(item.avg_note) || 0,
      _count: Number(item.nb_avis) || 0,
    }))
    const total = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0

    return NextResponse.json(
      { items, total, page, pageSize },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (e) {
    logger.error('Erreur search artisans:', e)
    return NextResponse.json({ error: 'Erreur recherche' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * GET /api/artisans/search?metier=X&ville=Y&urgence=1&page=0&pageSize=20&sort=...
 *
 * Pagination server-side avec filtres :
 *  - metier : match exact (ilike)
 *  - ville  : doit appartenir au tableau `zones`
 *  - urgence: artisans disponibles 24/7
 *  - sort   : meilleure-note | plus-avis | pertinence (default)
 *
 * Réponse :
 *  { items: Artisan[], total: number, page: number, pageSize: number }
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const metier = (url.searchParams.get('metier') || '').trim()
  const ville = (url.searchParams.get('ville') || '').trim()
  const urgence = url.searchParams.get('urgence') === '1'
  const noteMin = Number(url.searchParams.get('noteMin') || '0')
  const page = Math.max(0, Number(url.searchParams.get('page') || '0'))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || '20')))
  const sort = url.searchParams.get('sort') || 'pertinence'

  try {
    const supabase = await createClient()

    let query = supabase
      .from('artisans_public') // ← vue sans IBAN/BIC
      .select('*', { count: 'exact' })

    if (metier) query = query.ilike('metier', metier)
    if (urgence) query = query.eq('urgence', true)

    // Filtre ville : matche si le tableau zones contient la ville
    // (les valeurs sont insensibles à la casse côté UI, donc on cherche
    // toutes les casses possibles — la DB est strict)
    if (ville) {
      const variants = Array.from(new Set([
        ville,
        ville.charAt(0).toUpperCase() + ville.slice(1).toLowerCase(),
        ville.toLowerCase(),
        ville.toUpperCase(),
      ]))
      query = query.overlaps('zones', variants)
    }

    // Tri
    if (sort === 'meilleure-note' || sort === 'plus-avis') {
      // Tri sur note moyenne / nombre d'avis : on charge tout sans range pour ce cas
      // (alternative : créer une vue matérialisée. Pour l'instant on laisse defaut DB)
      query = query.order('created_at', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    // Pagination
    const from = page * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    // Pour le tri par note / avis, on enrichit avec les stats
    const items = data || []
    if (items.length > 0 && (sort === 'meilleure-note' || sort === 'plus-avis' || noteMin > 0)) {
      const ids = items.map((a) => a.id)
      const { data: avisData } = await supabase
        .from('avis')
        .select('artisan_id, note')
        .in('artisan_id', ids)

      const stats: Record<string, { sum: number; count: number }> = {}
      ;(avisData || []).forEach((a) => {
        if (!stats[a.artisan_id]) stats[a.artisan_id] = { sum: 0, count: 0 }
        stats[a.artisan_id].sum += a.note
        stats[a.artisan_id].count += 1
      })

      // Attache les stats à chaque artisan
      items.forEach((a) => {
        const s = stats[a.id] || { sum: 0, count: 0 }
        ;(a as Record<string, unknown>)._avg = s.count > 0 ? s.sum / s.count : 0
        ;(a as Record<string, unknown>)._count = s.count
      })

      // Filtre note minimum
      let filtered = items
      if (noteMin > 0) {
        filtered = items.filter((a) => ((a as Record<string, unknown>)._avg as number) >= noteMin)
      }

      // Tri local sur la page
      if (sort === 'meilleure-note') {
        filtered.sort((a, b) =>
          ((b as Record<string, unknown>)._avg as number) - ((a as Record<string, unknown>)._avg as number)
        )
      } else if (sort === 'plus-avis') {
        filtered.sort((a, b) =>
          ((b as Record<string, unknown>)._count as number) - ((a as Record<string, unknown>)._count as number)
        )
      }

      return NextResponse.json({
        items: filtered,
        total: count || 0,
        page,
        pageSize,
      })
    }

    return NextResponse.json({
      items,
      total: count || 0,
      page,
      pageSize,
    })
  } catch (e) {
    logger.error('Erreur search artisans:', e)
    return NextResponse.json({ error: 'Erreur recherche' }, { status: 500 })
  }
}

'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Logo from '@/components/Logo'
import AuthNavButton from '@/components/AuthNavButton'
import type { Artisan } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'

type ArtisanRating = { avg: number; count: number }

function generateStars(score: number) {
  const full = Math.floor(score)
  const hasHalf = score - full >= 0.5
  let stars = ''
  for (let i = 0; i < 5; i++) {
    if (i < full) stars += '\u2605'
    else if (i === full && hasHalf) stars += '\u2605'
    else stars += '\u2606'
  }
  return stars
}

function capitalize(s: string) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type FilterType = 'dispo' | 'note' | 'urgence'
// Note : « proximite » et « disponibilite » seront ajoutés quand la géoloc
// (R11) et les disponibilités en temps réel seront implémentées. Pour l'instant
// on ne propose que les tris réellement fonctionnels (anti LCD).
type SortType = 'pertinence' | 'meilleure-note' | 'plus-avis'

export default function RecherchePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--gray-500)] text-[15px]">Chargement...</p>
      </div>
    }>
      <RechercheContent />
    </Suspense>
  )
}

function RechercheContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const metier = capitalize(searchParams.get('metier') || '')
  const ville = capitalize(searchParams.get('ville') || '')
  const urgenceParam = searchParams.get('urgence')

  const metierDisplay = metier || 'Artisan'
  const villeDisplay = ville || 'Suisse romande'

  const [artisans, setArtisans] = useState<Artisan[]>([])
  const [ratings, setRatings] = useState<Record<string, ArtisanRating>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(() => {
    return urgenceParam === '1' ? new Set(['urgence'] as FilterType[]) : new Set()
  })
  const [sortBy, setSortBy] = useState<SortType>('pertinence')
  const PAGE_SIZE = 20
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // Nav search state
  const [navMetier, setNavMetier] = useState(metierDisplay)
  const [navVille, setNavVille] = useState(villeDisplay)
  const [menuOpen, setMenuOpen] = useState(false)


  // Charge une page via l'API serveur. pageToLoad=0 reset, sinon append.
  const loadPage = useCallback(async (pageToLoad: number) => {
    try {
      const params = new URLSearchParams({
        page: String(pageToLoad),
        pageSize: String(PAGE_SIZE),
        sort: sortBy,
      })
      if (metier) params.set('metier', metier)
      if (ville) params.set('ville', ville)
      if (activeFilters.has('urgence')) params.set('urgence', '1')
      if (activeFilters.has('note')) params.set('noteMin', '4')
      const res = await fetch(`/api/artisans/search?${params.toString()}`)
      if (!res.ok) throw new Error('search failed')
      const json = await res.json()
      const items = (json.items || []) as (Artisan & { _avg?: number; _count?: number })[]
      setTotal(json.total || 0)
      const newRatings: Record<string, ArtisanRating> = {}
      items.forEach((a) => {
        if (typeof a._count === 'number' && a._count > 0) {
          newRatings[a.id] = { avg: Math.round((a._avg || 0) * 10) / 10, count: a._count }
        }
      })
      if (pageToLoad === 0) {
        setArtisans(items as Artisan[])
        setRatings(newRatings)
      } else {
        setArtisans((prev) => [...prev, ...items as Artisan[]])
        setRatings((prev) => ({ ...prev, ...newRatings }))
      }
    } catch (err) {
      logger.error('Erreur loadPage:', err)
    }
  }, [metier, ville, activeFilters, sortBy])

  // Reset + recharge quand les filtres/tri changent
  useEffect(() => {
    setLoading(true)
    setError('')
    setPage(0)
    loadPage(0).finally(() => setLoading(false))
  }, [loadPage])

  async function handleLoadMore() {
    setLoadingMore(true)
    const next = page + 1
    setPage(next)
    await loadPage(next)
    setLoadingMore(false)
  }

  // Apply filters & sort
  const filteredArtisans = useMemo(() => {
    let result = [...artisans]

    // Apply filters
    if (activeFilters.has('note')) {
      result = result.filter(a => {
        const r = ratings[a.id]
        return r && r.avg >= 4
      })
    }
    if (activeFilters.has('urgence')) {
      result = result.filter(a => a.urgence)
    }
    if (activeFilters.has('dispo')) {
      // All artisans are considered "dispo" for now
    }

    // Apply sort
    if (sortBy === 'meilleure-note') {
      result.sort((a, b) => {
        const ra = ratings[a.id]?.avg || 0
        const rb = ratings[b.id]?.avg || 0
        return rb - ra
      })
    } else if (sortBy === 'plus-avis') {
      result.sort((a, b) => {
        const ca = ratings[a.id]?.count || 0
        const cb = ratings[b.id]?.count || 0
        return cb - ca
      })
    }

    return result
  }, [artisans, ratings, activeFilters, sortBy])

  const toggleFilter = useCallback((f: FilterType) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    setActiveFilters(new Set())
  }, [])

  function handleNavSearch() {
    const params = new URLSearchParams()
    if (navMetier.trim()) params.set('metier', navMetier.trim())
    if (navVille.trim()) params.set('ville', navVille.trim())
    router.push('/recherche' + (params.toString() ? '?' + params.toString() : ''))
  }

  function handleNavKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleNavSearch()
  }

  const hasActiveFilter = activeFilters.size > 0

  // Sort bar text
  const sortBarText = useMemo(() => {
    if (loading) return 'Chargement...'
    if (hasActiveFilter) {
      const labels: string[] = []
      if (activeFilters.has('urgence')) labels.push('urgence')
      if (activeFilters.has('dispo')) labels.push('disponibles cette semaine')
      if (activeFilters.has('note')) labels.push('4\u2605+')
      return `${filteredArtisans.length} artisan${filteredArtisans.length > 1 ? 's' : ''} \u2014 ${labels.join(', ')}`
    }
    return `Affichage de 1 \u00e0 ${filteredArtisans.length} sur ${filteredArtisans.length} r\u00e9sultats`
  }, [loading, hasActiveFilter, activeFilters, filteredArtisans.length])

  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV WITH INLINE SEARCH */}
      <nav className="fixed top-0 left-0 right-0 z-[100] py-3.5 px-10 flex items-center justify-between bg-[rgba(250,250,248,0.92)] backdrop-blur-[20px] border-b border-black/5 max-[900px]:px-4 max-[900px]:py-3">
        <Logo />

        {/* Nav search bar - hidden on mobile */}
        <div className="flex-1 max-w-[560px] mx-8 flex items-center bg-white border border-[var(--gray-200)] rounded-full py-1 pl-5 pr-1 transition-all focus-within:border-[var(--orange)] focus-within:shadow-[0_0_0_3px_rgba(232,112,10,0.08)] max-[900px]:hidden">
          <div className="flex-1 flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              type="text"
              value={navMetier}
              onChange={e => setNavMetier(e.target.value)}
              onKeyDown={handleNavKeyDown}
              className="border-none outline-none text-sm bg-transparent text-[var(--dark)] w-full"
              placeholder="M\u00e9tier..."
            />
          </div>
          <div className="w-px h-6 bg-[var(--gray-200)] mx-3 shrink-0" />
          <div className="flex-1 flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <input
              type="text"
              value={navVille}
              onChange={e => setNavVille(e.target.value)}
              onKeyDown={handleNavKeyDown}
              className="border-none outline-none text-sm bg-transparent text-[var(--dark)] w-full"
              placeholder="Ville..."
            />
          </div>
          <button
            onClick={handleNavSearch}
            className="bg-[var(--orange)] text-white border-none w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 hover:bg-[var(--orange-dark)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </button>
        </div>

        {/* Hamburger - mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="hidden max-[900px]:block bg-none border-none cursor-pointer p-2 text-[var(--dark)]"
          aria-label="Menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>

        {/* Desktop nav right */}
        <div className="flex items-center gap-5 shrink-0 max-[900px]:hidden">
          <AuthNavButton variant="dark" />
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="hidden max-[900px]:flex fixed top-[60px] left-0 right-0 bg-white flex-col p-6 gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)] border-b border-[var(--gray-200)] z-[99]">
            <Link href="/" className="text-[var(--gray-700)] no-underline text-sm font-medium hover:text-[var(--dark)]">Accueil</Link>
            <Link href="/inscription" className="text-[var(--gray-700)] no-underline text-sm font-medium hover:text-[var(--dark)]">Devenir artisan</Link>
            <Link href="/connexion" className="bg-[var(--dark)] text-white py-2 px-4.5 rounded-full font-semibold text-[13px] no-underline text-center transition-all hover:bg-[var(--orange)]">Connexion</Link>
          </div>
        )}
      </nav>

      {/* SEARCH HEADER */}
      <section className="pt-20 bg-white border-b border-[var(--gray-200)]">
        <div className="max-w-[1200px] mx-auto py-6 px-10 max-[900px]:px-4 max-[900px]:py-4 max-[500px]:px-3 max-[500px]:py-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[13px] text-[var(--gray-500)] mb-4 max-[900px]:text-xs max-[500px]:text-[11px] max-[500px]:gap-1">
            <Link href="/" className="text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">Accueil</Link>
            <span>›</span>
            <Link href={`/recherche?metier=${encodeURIComponent(metier)}`} className="text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">{metierDisplay}</Link>
            <span>›</span>
            <span className="text-[var(--dark)] font-medium">{villeDisplay}</span>
          </div>

          {/* Title row */}
          <div className="flex justify-between items-end mb-5 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-1">
            <div>
              <h1 className="font-sora text-[28px] font-extrabold max-[900px]:text-[22px] max-[500px]:text-[19px]">
                {metierDisplay} à <span className="text-[var(--orange)]">{villeDisplay}</span>
              </h1>
              <div className="text-[15px] text-[var(--gray-500)] max-[900px]:text-[13px] max-[500px]:text-xs">
                {loading
                  ? 'Recherche en cours...'
                  : `${artisans.length} professionnel${artisans.length > 1 ? 's' : ''} trouv\u00e9${artisans.length > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2.5 flex-wrap max-[960px]:overflow-x-auto max-[960px]:flex-nowrap max-[960px]:pb-1 max-[960px]:[&>button]:shrink-0">
            <button
              onClick={resetFilters}
              className={`flex items-center gap-2 py-2.5 px-4.5 rounded-full border text-sm font-medium cursor-pointer transition-all select-none max-[500px]:py-2.5 max-[500px]:px-4 max-[500px]:min-h-11 max-[500px]:text-[13px] ${
                !hasActiveFilter
                  ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.05)] text-[var(--orange)] font-semibold'
                  : 'border-[var(--gray-200)] bg-white text-[var(--gray-700)] hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)]'
              }`}
            >
              <svg className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              Tous
            </button>
            <button
              onClick={() => toggleFilter('dispo')}
              className={`flex items-center gap-2 py-2.5 px-4.5 rounded-full border text-sm font-medium cursor-pointer transition-all select-none max-[500px]:py-2.5 max-[500px]:px-4 max-[500px]:min-h-11 max-[500px]:text-[13px] ${
                activeFilters.has('dispo')
                  ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.05)] text-[var(--orange)] font-semibold'
                  : 'border-[var(--gray-200)] bg-white text-[var(--gray-700)] hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)]'
              }`}
            >
              <svg className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              Disponible cette semaine
            </button>
            <button
              onClick={() => toggleFilter('note')}
              className={`flex items-center gap-2 py-2.5 px-4.5 rounded-full border text-sm font-medium cursor-pointer transition-all select-none max-[500px]:py-2.5 max-[500px]:px-4 max-[500px]:min-h-11 max-[500px]:text-[13px] ${
                activeFilters.has('note')
                  ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.05)] text-[var(--orange)] font-semibold'
                  : 'border-[var(--gray-200)] bg-white text-[var(--gray-700)] hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)]'
              }`}
            >
              <svg className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              Note 4 étoiles et plus
            </button>
            <button
              onClick={() => toggleFilter('urgence')}
              className={`flex items-center gap-2 py-2.5 px-4.5 rounded-full border text-sm font-medium cursor-pointer transition-all select-none max-[500px]:py-2.5 max-[500px]:px-4 max-[500px]:min-h-11 max-[500px]:text-[13px] ${
                activeFilters.has('urgence')
                  ? 'border-[#D32F2F] bg-[rgba(211,47,47,0.06)] text-[#D32F2F] font-semibold'
                  : 'border-[var(--gray-200)] bg-white text-[var(--gray-700)] hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)]'
              }`}
            >
              <svg className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              Urgence
            </button>
          </div>
        </div>
      </section>

      {/* RESULTS */}
      <div className="max-w-[1200px] mx-auto py-6 px-10 pb-20 grid grid-cols-1 gap-4 w-full max-[900px]:px-4 max-[900px]:pb-[60px] max-[500px]:px-3 max-[500px]:pb-12 max-[500px]:gap-3">
        {/* Sort bar */}
        <div className="flex justify-between items-center mb-2 max-[900px]:flex-col max-[900px]:gap-2 max-[900px]:items-stretch">
          <div className="text-sm text-[var(--gray-500)] max-[500px]:text-xs">{sortBarText}</div>
          <div className="flex items-center gap-2 text-sm text-[var(--gray-700)] max-[500px]:text-xs">
            Trier par
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortType)}
              className="border border-[var(--gray-200)] rounded-lg py-2 pl-3 pr-8 text-sm text-[var(--dark)] bg-white cursor-pointer outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2712%27%20height%3D%278%27%20viewBox%3D%270%200%2012%208%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M1%201.5L6%206.5L11%201.5%27%20stroke%3D%27%238A8680%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] max-[900px]:text-base"
            >
              <option value="pertinence">Pertinence</option>
              <option value="meilleure-note">Meilleure note</option>
              <option value="plus-avis">Plus d&apos;avis</option>
            </select>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-[60px] px-5">
            <p className="text-[var(--gray-500)] text-[15px]">Chargement des artisans...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-[60px] px-5">
            <p className="text-[var(--red)] text-[15px]">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredArtisans.length === 0 && (
          <div className="text-center py-[60px] px-5">
            <svg className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8A8680" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M8 11h6" /></svg>
            <h3 className="font-sora text-lg font-bold text-[var(--dark)] mb-2">Aucun artisan trouvé</h3>
            <p className="text-[var(--gray-500)] text-sm leading-relaxed">
              Aucun artisan ne correspond à votre recherche.<br />Essayez avec d&apos;autres critères.
            </p>
          </div>
        )}

        {/* Artisan cards */}
        {!loading && !error && filteredArtisans.map((a, idx) => (
          <ArtisanCard key={a.id} artisan={a} rating={ratings[a.id]} index={idx} />
        ))}

        {/* « Voir plus » (pagination serveur) */}
        {!loading && !error && artisans.length < total && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="text-xs text-[var(--gray-500)]">
              {artisans.length} sur {total} artisans affichés
            </div>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="bg-[var(--dark)] text-white py-3 px-8 rounded-full font-sora font-bold text-sm border-none cursor-pointer transition-all hover:bg-[var(--orange)] hover:-translate-y-px disabled:opacity-60"
            >
              {loadingMore ? 'Chargement...' : 'Voir plus d’artisans'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== ARTISAN CARD COMPONENT =====
function ArtisanCard({ artisan: a, rating, index }: { artisan: Artisan; rating?: ArtisanRating; index: number }) {
  const name = a.entreprise || `${a.prenom || ''} ${a.nom || ''}`.trim() || 'Artisan'
  const metier = a.metier || 'Artisan'
  const zones = (a.zones || []).join(', ') || 'Non spécifié'
  const specialites = (a.specialites || []).slice(0, 3)
  const description = a.description || ''
  const urgence = a.urgence || false
  const telephone = a.telephone || ''

  const score = rating?.avg || 0
  const avisCount = rating?.count || 0
  const stars = generateStars(score)
  const scoreDisplay = avisCount > 0 ? score.toFixed(1) : '\u2014'
  const reviewsDisplay = avisCount > 0 ? `(${avisCount} avis)` : '(nouveau)'

  return (
    <div
      className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] grid grid-cols-[200px_1fr_240px] overflow-hidden transition-all cursor-pointer min-h-[240px] hover:border-[var(--gray-300)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 max-[960px]:grid-cols-1 max-[960px]:min-h-0"
      style={{ animation: `cardIn 0.4s ease-out ${0.05 * (index + 1)}s both` }}
      onClick={() => window.location.href = `/artisan/${a.id}`}
    >
      {/* Card image */}
      <div className="bg-gradient-to-br from-[var(--dark)] to-[var(--dark-mid)] flex items-center justify-center relative overflow-hidden max-[960px]:min-h-[140px]">
        {a.avatar_url ? (
          <Image
            src={a.avatar_url}
            alt={name}
            fill
            sizes="(max-width: 960px) 100vw, 200px"
            className="object-cover"
          />
        ) : (
          <svg className="w-12 h-12 text-white/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
        )}
        <div className="absolute bottom-3.5 left-3.5 flex flex-col gap-1.5">
          <span className="bg-white/95 backdrop-blur-[8px] py-1 px-3 rounded-full text-xs font-bold text-[var(--green)] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[var(--green)] rounded-full" />
            Disponible
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="py-[22px] px-6 flex flex-col justify-center gap-1.5 max-[900px]:p-4 max-[500px]:p-3">
        <h2 className="font-sora text-[19px] font-bold leading-tight max-[500px]:text-base">{name}</h2>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[#F0B429] text-[15px] tracking-wider max-[500px]:text-[13px]">{stars}</span>
          <span className="font-sora font-extrabold text-[15px] text-[var(--dark)] max-[500px]:text-[13px]">{scoreDisplay}</span>
          <span className="text-[13px] text-[var(--gray-500)] max-[500px]:text-[11px]">{reviewsDisplay}</span>
        </div>
        <div className="text-[var(--orange)] font-bold text-xs uppercase tracking-wider max-[500px]:text-[11px]">{metier}</div>
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--gray-700)] max-[500px]:text-xs">
          <svg className="w-3.5 h-3.5 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
          {zones}
        </div>
        <div className="flex flex-wrap gap-1.5 max-[500px]:gap-1">
          {specialites.map((s, i) => (
            <span key={i} className="bg-[var(--gray-100)] py-1 px-3 rounded-full text-[11px] text-[var(--gray-700)] font-medium max-[500px]:py-1 max-[500px]:px-2">{s}</span>
          ))}
        </div>
        {description && (
          <div className="text-[13px] text-[var(--gray-500)] leading-relaxed line-clamp-2 max-[500px]:text-xs">{description}</div>
        )}
        {urgence && telephone && (
          <a
            href={`tel:+41${telephone.replace(/\s/g, '')}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 bg-gradient-to-br from-[#D32F2F] to-[#B71C1C] text-white py-1.5 px-3.5 rounded-full text-[11px] font-bold tracking-wider mt-2 w-fit no-underline"
          >
            <span className="w-1.5 h-1.5 bg-[#FF8A80] rounded-full animate-pulse" />
            <svg className="w-[13px] h-[13px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
            Urgence — Appeler
          </a>
        )}
      </div>

      {/* Card sidebar */}
      <div className="py-5 px-5 border-l border-[var(--gray-200)] flex flex-col justify-center items-center gap-2.5 w-[240px] bg-[rgba(242,241,238,0.5)] max-[960px]:border-l-0 max-[960px]:border-t max-[960px]:border-[var(--gray-200)] max-[960px]:flex-row max-[960px]:flex-wrap max-[960px]:justify-center max-[960px]:p-4 max-[960px]:w-full max-[900px]:flex-col max-[500px]:p-3 max-[500px]:gap-2">
        <div className="text-center max-[960px]:w-full">
          <div className="text-xs text-[var(--gray-500)] mb-1 max-[500px]:text-[11px]">Prochaines disponibilités</div>
          <div className="font-sora text-[15px] font-bold text-[var(--green)] flex items-center justify-center gap-1.5 max-[500px]:text-[13px]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            Cette semaine
          </div>
        </div>
        <Link
          href={`/artisan/${a.id}`}
          onClick={e => e.stopPropagation()}
          className="bg-[var(--orange)] text-white py-3 px-7 rounded-full font-sora font-bold text-sm border-none cursor-pointer transition-all no-underline text-center w-full hover:bg-[var(--orange-dark)] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(232,112,10,0.25)] max-[960px]:flex-1 max-[500px]:text-[13px] max-[500px]:py-3 max-[500px]:min-h-11"
        >
          Voir le profil
        </Link>
        <Link
          href={`/demande?artisan=${a.id}`}
          onClick={e => e.stopPropagation()}
          className="bg-white text-[var(--dark)] py-2.5 px-7 rounded-full font-semibold text-[13px] border border-[var(--gray-300)] cursor-pointer transition-all no-underline text-center w-full flex items-center justify-center gap-1.5 hover:border-[var(--dark)] hover:bg-[var(--gray-100)] max-[960px]:flex-1 max-[500px]:text-[13px] max-[500px]:py-3 max-[500px]:px-4 max-[500px]:min-h-11"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          Contacter
        </Link>
      </div>
    </div>
  )
}

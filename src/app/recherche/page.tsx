'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Logo from '@/components/Logo'
import AuthNavButton from '@/components/AuthNavButton'
import CityAutocomplete from '@/components/CityAutocomplete'
import type { Artisan } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'
import { DEFAULT_ZONE_LABEL } from '@/lib/site'
import { METIERS } from '@/lib/metiers'
import { capitalize, normalizeText } from '@/lib/text'
import { summarizeWeekAvailability, formatNextSlot } from '@/lib/availability'
import { telHref } from '@/lib/phone'

/** Ligne renvoyée par /api/artisans/search (RPC search_artisans). */
type SearchItem = Artisan & { _avg?: number; _count?: number }

function generateStars(score: number) {
  const full = Math.floor(score)
  const hasHalf = score - full >= 0.5
  let stars = ''
  for (let i = 0; i < 5; i++) {
    if (i < full) stars += '★'
    else if (i === full && hasHalf) stars += '★'
    else stars += '☆'
  }
  return stars
}

// Filtres et tris : uniquement ce que la RPC search_artisans sait faire côté DB
// (pas de tri ni de filtre client sur une page partielle — anti LCD).
// « Disponible cette semaine » reviendra quand la RPC filtrera sur
// artisans.disponibilites.
type FilterType = 'note' | 'urgence'
type SortType = 'pertinence' | 'meilleure-note' | 'plus-avis'

const PAGE_SIZE = 20

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

  const metier = capitalize(searchParams.get('metier') || '')
  const ville = capitalize(searchParams.get('ville') || '')
  const urgenceParam = searchParams.get('urgence')

  const metierDisplay = metier || 'Artisan'
  const villeDisplay = ville || DEFAULT_ZONE_LABEL

  const [artisans, setArtisans] = useState<SearchItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(() => {
    return urgenceParam === '1' ? new Set(['urgence'] as FilterType[]) : new Set()
  })
  const [sortBy, setSortBy] = useState<SortType>('pertinence')

  // Champs de recherche (barre du haut sur desktop, formulaire sur mobile).
  // Vides par défaut : « Artisan » / « Suisse romande » ne sont que des libellés.
  const [navMetier, setNavMetier] = useState(metier)
  const [navVille, setNavVille] = useState(ville)
  const [menuOpen, setMenuOpen] = useState(false)

  const fetchPage = useCallback(async (pageToLoad: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      page: String(pageToLoad),
      pageSize: String(PAGE_SIZE),
      sort: sortBy,
    })
    if (metier) params.set('metier', metier)
    if (ville) params.set('ville', ville)
    if (activeFilters.has('urgence')) params.set('urgence', '1')
    if (activeFilters.has('note')) params.set('noteMin', '4')
    const res = await fetch(`/api/artisans/search?${params.toString()}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return { items: (json.items || []) as SearchItem[], total: Number(json.total) || 0 }
  }, [metier, ville, activeFilters, sortBy])

  // Recharge la première page quand la recherche, les filtres ou le tri
  // changent. Une réponse arrivée après un changement plus récent est ignorée.
  useEffect(() => {
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError('')
    setPage(0)
    fetchPage(0, controller.signal)
      .then(({ items, total }) => {
        setArtisans(items)
        setTotal(total)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        logger.error('Erreur recherche artisans:', err)
        setArtisans([])
        setTotal(0)
        setError('La recherche n’a pas pu aboutir. Vérifie ta connexion et réessaie.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [fetchPage, reloadKey])

  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const next = page + 1
      const { items, total } = await fetchPage(next)
      setArtisans((prev) => [...prev, ...items])
      setTotal(total)
      setPage(next)
    } catch (err) {
      logger.error('Erreur chargement page suivante:', err)
    } finally {
      setLoadingMore(false)
    }
  }

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

  // Même page, autres paramètres : History API native, synchronisée avec
  // useSearchParams (docs Next « Linking and Navigating › Native History API »).
  // router.push vers /recherche?… restait sans effet quand des cartes (liens
  // vers /artisan/[id]) étaient affichées : le formulaire ne relançait rien.
  function goToSearch(m: string, v: string) {
    const params = new URLSearchParams()
    if (m.trim()) params.set('metier', m.trim())
    if (v.trim()) params.set('ville', v.trim())
    if (activeFilters.has('urgence')) params.set('urgence', '1')
    window.history.pushState(null, '', '/recherche' + (params.toString() ? '?' + params.toString() : ''))
  }

  function handleNavSearch(e?: React.FormEvent) {
    e?.preventDefault()
    setMenuOpen(false)
    goToSearch(navMetier, navVille)
  }

  const hasActiveFilter = activeFilters.size > 0
  const resultLabel = `${total} professionnel${total > 1 ? 's' : ''} trouvé${total > 1 ? 's' : ''}`

  const sortBarText = useMemo(() => {
    if (loading) return 'Chargement...'
    if (error) return ''
    const filters: string[] = []
    if (activeFilters.has('urgence')) filters.push('urgence')
    if (activeFilters.has('note')) filters.push('4★ et plus')
    const base = artisans.length < total
      ? `Affichage de 1 à ${artisans.length} sur ${total} résultats`
      : `${total} résultat${total > 1 ? 's' : ''}`
    return filters.length > 0 ? `${base} — ${filters.join(', ')}` : base
  }, [loading, error, activeFilters, artisans.length, total])

  // Calculé une fois par rendu de liste (les cartes ne sont rendues que côté client)
  const now = useMemo(() => new Date(), [artisans]) // eslint-disable-line react-hooks/exhaustive-deps

  const filterBtn = (active: boolean, danger = false) =>
    `flex items-center gap-2 py-2.5 px-4.5 rounded-full border text-sm font-medium cursor-pointer transition-all select-none max-[500px]:py-2.5 max-[500px]:px-4 max-[500px]:min-h-11 max-[500px]:text-[13px] ${
      active
        ? danger
          ? 'border-[var(--red)] bg-[rgba(211,47,47,0.06)] text-[var(--red)] font-semibold'
          : 'border-[var(--orange)] bg-[rgba(232,112,10,0.05)] text-[var(--orange)] font-semibold'
        : 'border-[var(--gray-200)] bg-white text-[var(--gray-700)] hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)]'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV WITH INLINE SEARCH */}
      <nav className="fixed top-0 left-0 right-0 z-[100] py-3.5 px-10 flex items-center justify-between bg-[rgba(250,250,248,0.92)] backdrop-blur-[20px] border-b border-black/5 max-[900px]:px-4 max-[900px]:py-3">
        <Logo />

        {/* Nav search bar - desktop */}
        <form
          role="search"
          onSubmit={handleNavSearch}
          className="flex-1 max-w-[560px] mx-8 flex items-center bg-white border border-[var(--gray-200)] rounded-full py-1 pl-5 pr-1 transition-all focus-within:border-[var(--orange)] focus-within:shadow-[0_0_0_3px_rgba(232,112,10,0.08)] max-[900px]:hidden"
        >
          <div className="flex-1 flex items-center gap-2 text-sm">
            <svg aria-hidden="true" className="w-4 h-4 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              type="text"
              value={navMetier}
              onChange={e => setNavMetier(e.target.value)}
              list="recherche-metiers"
              aria-label="Métier"
              className="border-none outline-none text-sm bg-transparent text-[var(--dark)] w-full"
              placeholder="Métier..."
            />
          </div>
          <div className="w-px h-6 bg-[var(--gray-200)] mx-3 shrink-0" />
          <div className="flex-1 flex items-center gap-2 text-sm">
            <svg aria-hidden="true" className="w-4 h-4 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <input
              type="text"
              value={navVille}
              onChange={e => setNavVille(e.target.value)}
              aria-label="Ville ou NPA"
              className="border-none outline-none text-sm bg-transparent text-[var(--dark)] w-full"
              placeholder="Ville..."
            />
          </div>
          <button
            type="submit"
            aria-label="Rechercher"
            className="bg-[var(--orange)] text-white border-none w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 hover:bg-[var(--orange-dark)]"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </button>
        </form>
        <datalist id="recherche-metiers">
          {METIERS.map((m) => <option key={m} value={m} />)}
        </datalist>

        {/* Hamburger - mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="hidden max-[900px]:block bg-none border-none cursor-pointer p-2 text-[var(--dark)]"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          aria-controls="recherche-menu"
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>

        {/* Desktop nav right */}
        <div className="flex items-center gap-5 shrink-0 max-[900px]:hidden">
          <AuthNavButton variant="dark" />
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id="recherche-menu" className="hidden max-[900px]:flex fixed top-[60px] left-0 right-0 bg-white flex-col p-6 gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)] border-b border-[var(--gray-200)] z-[99]">
            <Link href="/" className="text-[var(--gray-700)] no-underline text-sm font-medium hover:text-[var(--dark)]">Accueil</Link>
            <Link href="/inscription" className="text-[var(--gray-700)] no-underline text-sm font-medium hover:text-[var(--dark)]">Devenir artisan</Link>
            <AuthNavButton variant="dark" />
          </div>
        )}
      </nav>

      {/* SEARCH HEADER */}
      <section className="pt-20 bg-white border-b border-[var(--gray-200)]">
        <div className="max-w-[1200px] mx-auto py-6 px-10 max-[900px]:px-4 max-[900px]:py-4 max-[500px]:px-3 max-[500px]:py-3">
          {/* Breadcrumb */}
          <nav aria-label="Fil d’Ariane" className="flex items-center gap-2 text-[13px] text-[var(--gray-500)] mb-4 max-[900px]:text-xs max-[500px]:text-[11px] max-[500px]:gap-1">
            <Link href="/" className="text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">Accueil</Link>
            <span aria-hidden="true">›</span>
            <Link href={`/recherche?metier=${encodeURIComponent(metier)}`} className="text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">{metierDisplay}</Link>
            <span aria-hidden="true">›</span>
            <span className="text-[var(--dark)] font-medium" aria-current="page">{villeDisplay}</span>
          </nav>

          {/* Title row */}
          <div className="flex justify-between items-end mb-5 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-1">
            <div>
              <h1 className="font-sora text-[28px] font-extrabold max-[900px]:text-[22px] max-[500px]:text-[19px]">
                {metierDisplay} à <span className="text-[var(--orange)]">{villeDisplay}</span>
              </h1>
              <div className="text-[15px] text-[var(--gray-500)] max-[900px]:text-[13px] max-[500px]:text-xs" aria-live="polite">
                {loading ? 'Recherche en cours...' : error ? '' : resultLabel}
              </div>
            </div>
          </div>

          {/* Mobile search form — la barre de la nav est masquée sous 900px */}
          <form
            role="search"
            onSubmit={handleNavSearch}
            className="hidden max-[900px]:flex flex-col gap-1 mb-4 p-2 bg-white rounded-[18px] border border-[var(--gray-200)] shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:border-[var(--orange)]"
          >
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-[14px]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-[var(--gray-500)] shrink-0"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <input
                type="text"
                value={navMetier}
                onChange={e => setNavMetier(e.target.value)}
                list="recherche-metiers"
                aria-label="Métier"
                placeholder="Quel métier ?"
                className="border-none outline-none text-base w-full bg-transparent text-[var(--dark)] placeholder:text-[var(--gray-500)]"
              />
            </div>
            <div className="h-px bg-[var(--gray-200)] mx-3" />
            <CityAutocomplete value={navVille} onChange={setNavVille} />
            <button
              type="submit"
              className="bg-[var(--orange)] text-white border-none py-3.5 rounded-[14px] font-sora font-bold text-[15px] cursor-pointer flex items-center justify-center gap-2 hover:bg-[var(--orange-dark)]"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              Mettre à jour la recherche
            </button>
          </form>

          {/* Filters */}
          <div role="group" aria-label="Filtres" className="flex gap-2.5 flex-wrap max-[960px]:overflow-x-auto max-[960px]:flex-nowrap max-[960px]:pb-1 max-[960px]:[&>button]:shrink-0">
            <button onClick={resetFilters} aria-pressed={!hasActiveFilter} className={filterBtn(!hasActiveFilter)}>
              <svg aria-hidden="true" className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              Tous
            </button>
            <button onClick={() => toggleFilter('note')} aria-pressed={activeFilters.has('note')} className={filterBtn(activeFilters.has('note'))}>
              <svg aria-hidden="true" className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              Note 4 étoiles et plus
            </button>
            <button onClick={() => toggleFilter('urgence')} aria-pressed={activeFilters.has('urgence')} className={filterBtn(activeFilters.has('urgence'), true)}>
              <svg aria-hidden="true" className="w-4 h-4 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
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
          <label className="flex items-center gap-2 text-sm text-[var(--gray-700)] max-[500px]:text-xs">
            Trier par
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortType)}
              className="border border-[var(--gray-200)] rounded-lg py-2 pl-3 pr-8 text-sm text-[var(--dark)] bg-white cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2712%27%20height%3D%278%27%20viewBox%3D%270%200%2012%208%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M1%201.5L6%206.5L11%201.5%27%20stroke%3D%27%238A8680%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] focus:border-[var(--orange)] max-[900px]:text-base"
            >
              <option value="pertinence">Pertinence</option>
              <option value="meilleure-note">Meilleure note</option>
              <option value="plus-avis">Plus d&apos;avis</option>
            </select>
          </label>
        </div>

        {/* Loading state */}
        {loading && (
          <div aria-hidden="true" className="grid gap-4 max-[500px]:gap-3">
            {[0, 1, 2].map((i) => <ArtisanCardSkeleton key={i} />)}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div role="alert" className="text-center py-[60px] px-5 bg-white rounded-[var(--radius)] border border-[var(--gray-200)]">
            <svg aria-hidden="true" className="mx-auto mb-4 text-[var(--red)]" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <h2 className="font-sora text-lg font-bold text-[var(--dark)] mb-2">Oups, un souci technique</h2>
            <p className="text-[var(--gray-500)] text-sm leading-relaxed mb-5">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="bg-[var(--dark)] text-white py-3 px-7 rounded-full font-sora font-bold text-sm border-none cursor-pointer transition-all hover:bg-[var(--orange)]"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Empty state — reprend la requête et propose des alternatives */}
        {!loading && !error && artisans.length === 0 && (
          <EmptyResults
            metier={metier}
            ville={ville}
            hasActiveFilter={hasActiveFilter}
            onResetFilters={resetFilters}
          />
        )}

        {/* Artisan cards */}
        {!loading && !error && artisans.map((a, idx) => (
          <ArtisanCard key={a.id} artisan={a} index={idx} now={now} />
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

// ===== EMPTY STATE =====
function EmptyResults({ metier, ville, hasActiveFilter, onResetFilters }: {
  metier: string
  ville: string
  hasActiveFilter: boolean
  onResetFilters: () => void
}) {
  const villeQuery = ville ? `&ville=${encodeURIComponent(ville)}` : ''
  const autresMetiers = METIERS.filter((m) => normalizeText(m) !== normalizeText(metier))
  const action = 'inline-flex items-center gap-1.5 rounded-full py-2.5 px-5 text-sm font-semibold no-underline cursor-pointer transition-all min-h-11'

  return (
    <div className="text-center py-12 px-6 bg-white rounded-[var(--radius)] border border-[var(--gray-200)] max-[500px]:py-8 max-[500px]:px-4">
      <svg aria-hidden="true" className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8A8680" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M8 11h6" /></svg>
      <h2 className="font-sora text-lg font-bold text-[var(--dark)] mb-2">
        Aucun {metier ? metier.toLowerCase() : 'artisan'} trouvé{ville ? ` à ${ville}` : ''}
      </h2>
      <p className="text-[var(--gray-500)] text-sm leading-relaxed mb-6 max-w-[440px] mx-auto">
        Artisano est en lancement : tous les métiers ne sont pas encore couverts partout.
        Essaie l’une de ces pistes.
      </p>

      <div className="flex flex-wrap justify-center gap-2.5 mb-8">
        {hasActiveFilter && (
          <button onClick={onResetFilters} className={`${action} bg-[var(--orange)] text-white border-none hover:bg-[var(--orange-dark)]`}>
            Retirer les filtres
          </button>
        )}
        {ville && metier && (
          <Link href={`/recherche?metier=${encodeURIComponent(metier)}`} className={`${action} bg-[var(--dark)] text-white hover:bg-[var(--orange)]`}>
            {metier} dans toute la zone
          </Link>
        )}
        {ville && metier && (
          <Link href={`/recherche?ville=${encodeURIComponent(ville)}`} className={`${action} bg-white text-[var(--dark)] border border-[var(--gray-300)] hover:border-[var(--dark)]`}>
            Tous les artisans à {ville}
          </Link>
        )}
        {(!ville || !metier) && (metier || ville) && (
          <Link href="/recherche" className={`${action} bg-[var(--dark)] text-white hover:bg-[var(--orange)]`}>
            Voir tous les artisans
          </Link>
        )}
      </div>

      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--gray-500)] mb-3">
        Autres métiers{ville ? ` à ${ville}` : ''}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 max-w-[560px] mx-auto">
        {autresMetiers.map((m) => (
          <Link
            key={m}
            href={`/recherche?metier=${encodeURIComponent(m)}${villeQuery}`}
            className="rounded-full py-1.5 px-3.5 text-[13px] font-medium no-underline bg-[var(--gray-100)] text-[var(--gray-700)] border border-transparent hover:border-[var(--gray-300)] hover:text-[var(--dark)] transition-colors"
          >
            {m}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ===== SKELETON =====
function ArtisanCardSkeleton() {
  return (
    <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] grid grid-cols-[200px_1fr_240px] overflow-hidden min-h-[240px] max-[960px]:grid-cols-1 max-[960px]:min-h-0">
      <div className="skeleton !rounded-none max-[960px]:h-[140px]" />
      <div className="py-[22px] px-6 flex flex-col justify-center gap-3 max-[900px]:p-4">
        <div className="skeleton h-5 w-1/2" />
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-3 w-1/4" />
        <div className="skeleton h-3 w-2/3" />
        <div className="flex gap-1.5">
          <div className="skeleton h-6 w-20 !rounded-full" />
          <div className="skeleton h-6 w-24 !rounded-full" />
        </div>
      </div>
      <div className="py-5 px-5 border-l border-[var(--gray-200)] flex flex-col justify-center items-center gap-3 max-[960px]:border-l-0 max-[960px]:border-t max-[960px]:p-4">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-11 w-full !rounded-full" />
        <div className="skeleton h-10 w-full !rounded-full" />
      </div>
    </div>
  )
}

// ===== ARTISAN CARD COMPONENT =====
// Toute la carte est cliquable via le lien du titre (étendu en ::after) ;
// les autres liens passent au-dessus (relative z-[1]).
function ArtisanCard({ artisan: a, index, now }: { artisan: SearchItem; index: number; now: Date }) {
  const name = a.entreprise || `${a.prenom || ''} ${a.nom || ''}`.trim() || 'Artisan'
  const metier = a.metier || 'Artisan'
  const zones = (a.zones || []).join(', ') || 'Non spécifié'
  const specialites = (a.specialites || []).slice(0, 3)
  const description = a.description || ''
  const tel = a.urgence ? telHref(a.telephone) : ''

  const avisCount = typeof a._count === 'number' ? a._count : 0
  const score = avisCount > 0 ? Math.round((a._avg || 0) * 10) / 10 : 0
  const stars = generateStars(score)
  const scoreDisplay = avisCount > 0 ? score.toFixed(1) : '—'
  const reviewsDisplay = avisCount > 0 ? `(${avisCount} avis)` : '(nouveau)'

  const dispo = summarizeWeekAvailability(a.disponibilites, now)

  return (
    <article
      className="group relative bg-white rounded-[var(--radius)] border border-[var(--gray-200)] grid grid-cols-[200px_1fr_240px] overflow-hidden transition-all min-h-[240px] hover:border-[var(--gray-300)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 focus-within:border-[var(--orange)] max-[960px]:grid-cols-1 max-[960px]:min-h-0"
      style={{ animation: `cardIn 0.4s ease-out ${0.05 * (index % PAGE_SIZE + 1)}s both` }}
    >
      {/* Card image */}
      <div className="bg-gradient-to-br from-[var(--dark)] to-[var(--dark-mid)] flex items-center justify-center relative overflow-hidden max-[960px]:min-h-[140px]">
        {a.avatar_url ? (
          <Image
            src={a.avatar_url}
            alt=""
            fill
            sizes="(max-width: 960px) 100vw, 200px"
            className="object-cover"
          />
        ) : (
          <svg aria-hidden="true" className="w-12 h-12 text-white/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
        )}
        <div className="absolute bottom-3.5 left-3.5 flex flex-col items-start gap-1.5">
          {a.ide_verified && (
            <span title={a.ide_company_name ? `Entreprise vérifiée au registre IDE : ${a.ide_company_name}` : 'Entreprise vérifiée au registre IDE'} className="bg-white/95 backdrop-blur-[8px] py-1 px-3 rounded-full text-xs font-bold text-[var(--dark)] flex items-center gap-1.5">
              <svg aria-hidden="true" className="w-3 h-3 text-[var(--green)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              Vérifié IDE
            </span>
          )}
          {dispo.next && (
            <span className="bg-white/95 backdrop-blur-[8px] py-1 px-3 rounded-full text-xs font-bold text-[var(--green)] flex items-center gap-1.5">
              <span aria-hidden="true" className="w-1.5 h-1.5 bg-[var(--green)] rounded-full" />
              Créneaux cette semaine
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="py-[22px] px-6 flex flex-col justify-center gap-1.5 max-[900px]:p-4 max-[500px]:p-3">
        <h2 className="font-sora text-[19px] font-bold leading-tight max-[500px]:text-base">
          <Link href={`/artisan/${a.id}`} className="text-inherit no-underline focus-visible:outline-none after:absolute after:inset-0 after:content-[''] after:rounded-[var(--radius)] focus-visible:after:shadow-[inset_0_0_0_3px_rgba(232,112,10,0.55)] group-hover:text-[var(--orange)] transition-colors">
            {name}
          </Link>
        </h2>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span aria-hidden="true" className="text-[#F0B429] text-[15px] tracking-wider max-[500px]:text-[13px]">{stars}</span>
          <span className="sr-only">{avisCount > 0 ? `Note ${scoreDisplay} sur 5` : 'Pas encore noté'}</span>
          <span aria-hidden="true" className="font-sora font-extrabold text-[15px] text-[var(--dark)] max-[500px]:text-[13px]">{scoreDisplay}</span>
          <span className="text-[13px] text-[var(--gray-500)] max-[500px]:text-[11px]">{reviewsDisplay}</span>
        </div>
        <div className="text-[var(--orange)] font-bold text-xs uppercase tracking-wider max-[500px]:text-[11px]">{metier}</div>
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--gray-700)] max-[500px]:text-xs">
          <svg aria-hidden="true" className="w-3.5 h-3.5 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
          {zones}
        </div>
        {specialites.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-[500px]:gap-1">
            {specialites.map((s, i) => (
              <span key={i} className="bg-[var(--gray-100)] py-1 px-3 rounded-full text-[11px] text-[var(--gray-700)] font-medium max-[500px]:py-1 max-[500px]:px-2">{s}</span>
            ))}
          </div>
        )}
        {description && (
          <div className="text-[13px] text-[var(--gray-500)] leading-relaxed line-clamp-2 max-[500px]:text-xs">{description}</div>
        )}
        {tel && (
          <a
            href={tel}
            className="relative z-[1] flex items-center gap-1.5 bg-gradient-to-br from-[#D32F2F] to-[#B71C1C] text-white py-1.5 px-3.5 rounded-full text-[11px] font-bold tracking-wider mt-2 w-fit no-underline"
          >
            <span aria-hidden="true" className="w-1.5 h-1.5 bg-[#FF8A80] rounded-full animate-pulse" />
            <svg aria-hidden="true" className="w-[13px] h-[13px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
            Urgence — Appeler
          </a>
        )}
      </div>

      {/* Card sidebar */}
      <div className="py-5 px-5 border-l border-[var(--gray-200)] flex flex-col justify-center items-center gap-2.5 w-[240px] bg-[rgba(242,241,238,0.5)] max-[960px]:border-l-0 max-[960px]:border-t max-[960px]:border-[var(--gray-200)] max-[960px]:flex-row max-[960px]:flex-wrap max-[960px]:justify-center max-[960px]:p-4 max-[960px]:w-full max-[900px]:flex-col max-[500px]:p-3 max-[500px]:gap-2">
        <div className="text-center max-[960px]:w-full">
          <div className="text-xs text-[var(--gray-500)] mb-1 max-[500px]:text-[11px]">
            {dispo.next ? 'Prochain créneau publié' : 'Disponibilités'}
          </div>
          {dispo.next ? (
            <div className="font-sora text-[15px] font-bold text-[var(--green)] flex items-center justify-center gap-1.5 max-[500px]:text-[13px]">
              <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {formatNextSlot(dispo.next, now)}
            </div>
          ) : (
            <div className="font-sora text-sm font-semibold text-[var(--gray-700)] max-[500px]:text-[13px]">
              {dispo.published ? 'Complet cette semaine' : 'Sur demande'}
            </div>
          )}
        </div>
        <span
          aria-hidden="true"
          className="bg-[var(--orange)] text-white py-3 px-7 rounded-full font-sora font-bold text-sm transition-all text-center w-full group-hover:bg-[var(--orange-dark)] group-hover:shadow-[0_6px_20px_rgba(232,112,10,0.25)] max-[960px]:flex-1 max-[500px]:text-[13px] max-[500px]:py-3 max-[500px]:min-h-11"
        >
          Voir le profil
        </span>
        <Link
          href={`/demande?artisan=${a.id}`}
          aria-label={`Contacter ${name}`}
          className="relative z-[1] bg-white text-[var(--dark)] py-2.5 px-7 rounded-full font-semibold text-[13px] border border-[var(--gray-300)] cursor-pointer transition-all no-underline text-center w-full flex items-center justify-center gap-1.5 hover:border-[var(--dark)] hover:bg-[var(--gray-100)] max-[960px]:flex-1 max-[500px]:text-[13px] max-[500px]:py-3 max-[500px]:px-4 max-[500px]:min-h-11"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          Contacter
        </Link>
      </div>
    </article>
  )
}

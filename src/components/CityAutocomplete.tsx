'use client'

import { useState, useRef, useEffect } from 'react'

/**
 * Autocomplétion de localité, alimentée par /api/localites (référentiel
 * officiel swisstopo — toute la Suisse, 26 cantons).
 *
 * Sans saisie, on propose quelques grandes villes pour amorcer. Si l'API est
 * injoignable, la liste de secours reste filtrable localement.
 */

type Localite = { nom: string; npa: number; canton: string; commune?: string | null }

const FALLBACK: Localite[] = [
  { nom: 'Lausanne', npa: 1003, canton: 'VD' },
  { nom: 'Genève', npa: 1201, canton: 'GE' },
  { nom: 'Fribourg', npa: 1700, canton: 'FR' },
  { nom: 'Neuchâtel', npa: 2000, canton: 'NE' },
  { nom: 'Sion', npa: 1950, canton: 'VS' },
  { nom: 'Delémont', npa: 2800, canton: 'JU' },
  { nom: 'Bern', npa: 3000, canton: 'BE' },
  { nom: 'Zürich', npa: 8000, canton: 'ZH' },
  { nom: 'Basel', npa: 4000, canton: 'BS' },
  { nom: 'Luzern', npa: 6000, canton: 'LU' },
  { nom: 'Lugano', npa: 6900, canton: 'TI' },
  { nom: 'St. Gallen', npa: 9000, canton: 'SG' },
]

const DEBOUNCE_MS = 150

type Props = {
  value: string
  onChange: (value: string) => void
}

function localFilter(q: string): Localite[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return FALLBACK
  return FALLBACK.filter((l) => l.nom.toLowerCase().includes(needle))
}

export default function CityAutocomplete({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Localite[]>(FALLBACK)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Recherche serveur, débouncée et annulable
  useEffect(() => {
    const q = value.trim()
    if (!open && !overlayOpen) return
    if (q.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions(FALLBACK)
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const res = await fetch(`/api/localites?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        if (!res.ok) throw new Error('localites failed')
        const json = await res.json()
        const items = (json.items || []) as Localite[]
        setSuggestions(items.length > 0 ? items : localFilter(q))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setSuggestions(localFilter(q))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [value, open, overlayOpen])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  function isMobile() {
    return typeof window !== 'undefined' && window.innerWidth <= 900
  }

  function handleFocus() {
    if (isMobile()) {
      inputRef.current?.blur()
      setOverlayOpen(true)
    } else {
      setOpen(true)
    }
  }

  function selectCity(loc: Localite) {
    onChange(loc.nom)
    setOpen(false)
    setOverlayOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      e.stopPropagation()
      selectCity(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const pinIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0 opacity-50">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )

  const emptyLabel = loading ? 'Recherche…' : 'Aucune localité trouvée'

  function renderItem(loc: Localite, i: number, mobile: boolean) {
    const active = !mobile && i === activeIndex
    return (
      <div
        key={`${loc.nom}-${loc.npa}-${loc.canton}`}
        onMouseDown={mobile ? undefined : (e) => { e.preventDefault(); selectCity(loc) }}
        onClick={mobile ? () => selectCity(loc) : undefined}
        className={`flex items-center gap-2.5 rounded-[var(--radius-xs)] cursor-pointer transition-colors text-[var(--dark)] ${
          mobile ? 'px-4 py-3.5 text-base' : 'px-3.5 py-2.5 text-[15px]'
        } ${active ? 'bg-[var(--orange)] text-white' : 'hover:bg-[var(--orange)] hover:text-white'}`}
      >
        {pinIcon}
        <span className="flex-1 truncate">{loc.nom}</span>
        <span className={`text-xs shrink-0 ${active ? 'text-white/80' : 'text-[var(--gray-500)]'}`}>
          {loc.npa} · {loc.canton}
        </span>
      </div>
    )
  }

  return (
    <>
      <div ref={wrapperRef} className="relative flex-1 flex items-center gap-3 px-5 py-3.5 rounded-[14px] hover:bg-[var(--gray-100)] transition-colors max-[900px]:w-full">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-[var(--gray-500)] shrink-0">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Où ? (ville, code postal...)"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1) }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="border-none outline-none text-base w-full bg-transparent text-[var(--dark)] placeholder:text-[var(--gray-500)]"
        />

        {/* Desktop dropdown */}
        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 right-0 min-w-[280px] bg-white rounded-[var(--radius-sm)] shadow-[0_8px_40px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] max-h-60 overflow-y-auto z-[9999] p-1.5" role="listbox">
            {suggestions.length === 0 ? (
              <div className="p-3.5 text-sm text-[var(--gray-500)] text-center">{emptyLabel}</div>
            ) : (
              suggestions.map((loc, i) => renderItem(loc, i, false))
            )}
          </div>
        )}
      </div>

      {/* Mobile overlay */}
      {overlayOpen && (
        <div className="fixed inset-0 z-[10000] bg-white flex flex-col animate-fade-up">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--gray-200)] shrink-0">
            <button
              onClick={() => setOverlayOpen(false)}
              className="bg-transparent border-none cursor-pointer p-2 rounded-full flex items-center justify-center hover:bg-[var(--gray-100)]"
              aria-label="Fermer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-[var(--dark)]">
                <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="text"
              placeholder="Rechercher une ville ou un NPA..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoFocus
              autoComplete="off"
              className="flex-1 border-none outline-none text-lg text-[var(--dark)] bg-transparent placeholder:text-[var(--gray-500)]"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2 overscroll-contain">
            {suggestions.length === 0 ? (
              <div className="p-3.5 text-sm text-[var(--gray-500)] text-center">{emptyLabel}</div>
            ) : (
              suggestions.map((loc, i) => renderItem(loc, i, true))
            )}
          </div>
        </div>
      )}
    </>
  )
}

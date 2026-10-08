'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import CityAutocomplete from './CityAutocomplete'
import { METIERS } from '@/lib/metiers'
import { suggestMetiers } from '@/lib/orientation'

// En dessous, on attend que la personne ait fini sa phrase avant de conclure
// « aucun métier reconnu ».
const NO_MATCH_HINT_LENGTH = 12

// Exemples cliquables sous le champ (comme les suggestions sous la recherche d'Airtasker)
const EXEMPLES = ['Fuite sous l’évier', 'Porte claquée', 'Le disjoncteur saute', 'Chaudière en panne', 'Tailler la haie']

export default function HeroSearch() {
  const router = useRouter()
  const [metier, setMetier] = useState('')
  const [ville, setVille] = useState('')
  const [urgence, setUrgence] = useState(false)
  const [orientOpen, setOrientOpen] = useState(false)
  const [probleme, setProbleme] = useState('')
  const orientId = useId()

  const suggestions = suggestMetiers(probleme)
  const showNoMatch = suggestions.length === 0 && probleme.trim().length >= NO_MATCH_HINT_LENGTH

  function doSearch(metierOverride?: string) {
    const params = new URLSearchParams()
    const m = (metierOverride ?? metier).trim()
    if (m) params.set('metier', m)
    if (ville.trim()) params.set('ville', ville.trim())
    if (urgence) params.set('urgence', '1')
    router.push(`/recherche${params.toString() ? '?' + params.toString() : ''}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') doSearch()
  }

  return (
    <>
      {/* Search Box */}
      <div className="bg-white rounded-[20px] p-2 shadow-[0_4px_40px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] flex items-center gap-1 max-w-[720px] w-full animate-fade-up delay-4 transition-all relative z-10 focus-within:shadow-[0_8px_60px_rgba(232,112,10,0.15),0_0_0_2px_var(--orange)] focus-within:-translate-y-1 max-[900px]:flex-col max-[900px]:p-3">
        {/* Métier input */}
        <div className="flex-1 flex items-center gap-3 px-5 py-3.5 rounded-[14px] hover:bg-[var(--gray-100)] transition-colors max-[900px]:w-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-[var(--gray-500)] shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Quel métier ? (plombier, électricien...)"
            aria-label="Métier recherché"
            list="hero-metiers"
            value={metier}
            onChange={(e) => setMetier(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-none outline-none text-base w-full bg-transparent text-[var(--dark)] placeholder:text-[var(--gray-500)]"
          />
          <datalist id="hero-metiers">
            {METIERS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>

        <div className="w-px h-8 bg-[var(--gray-300)] shrink-0 max-[900px]:w-full max-[900px]:h-px" />

        {/* City input */}
        <CityAutocomplete value={ville} onChange={setVille} />

        {/* Search button */}
        <button
          type="button"
          onClick={() => doSearch()}
          className="bg-[var(--orange)] text-white border-none px-8 py-3.5 rounded-[14px] font-sora font-bold text-[15px] cursor-pointer transition-all shrink-0 flex items-center gap-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.35)] max-[900px]:w-full max-[900px]:justify-center"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          Chercher
        </button>
      </div>

      {/* Urgence toggle — vraie case à cocher (clavier + lecteurs d'écran), habillée en interrupteur */}
      <label className="flex items-center gap-3 mt-4 cursor-pointer select-none animate-fade-up delay-5">
        <input
          type="checkbox"
          role="switch"
          checked={urgence}
          onChange={(e) => setUrgence(e.target.checked)}
          className="peer sr-only"
        />
        <span aria-hidden="true" className={`w-11 h-6 rounded-full relative transition-colors peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[rgba(232,112,10,0.55)] peer-focus-visible:outline-solid ${urgence ? 'bg-[var(--red)]' : 'bg-[var(--gray-300)]'}`}>
          <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${urgence ? 'translate-x-5' : ''}`} />
        </span>
        <span className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${urgence ? 'text-[var(--red)]' : 'text-[var(--gray-700)]'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" className={`transition-colors ${urgence ? 'text-[var(--red)]' : 'text-[var(--gray-500)]'}`}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Urgence — Artisan disponible maintenant
        </span>
      </label>

      {/* Orientation : description libre → métiers suggérés (src/lib/orientation.ts) */}
      <div className="mt-5 animate-fade-up delay-6 relative z-[1] w-full max-w-[560px] flex flex-col items-center">
        <button
          type="button"
          aria-expanded={orientOpen}
          aria-controls={orientId}
          onClick={() => setOrientOpen((o) => !o)}
          className="inline-flex items-center gap-2.5 bg-[var(--dark)] text-white border-none px-6 py-3 rounded-full text-sm font-medium cursor-pointer transition-all hover:bg-[var(--dark-mid)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(26,26,46,0.25)] max-[900px]:text-[13px] max-[900px]:px-5 max-[900px]:min-h-11"
        >
          <span className="text-base animate-sparkle" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z" /></svg>
          </span>
          Pas sûr du métier ? Décris ton problème, on t&apos;oriente
        </button>

        {orientOpen && (
          <div id={orientId} className="mt-4 w-full bg-white border border-[var(--gray-200)] rounded-[var(--radius)] p-5 text-left shadow-[0_8px_32px_rgba(0,0,0,0.06)]" style={{ animation: 'fadeIn 0.3s ease-out both' }}>
            <label htmlFor={`${orientId}-texte`} className="block font-sora font-bold text-[15px] mb-2">
              Que se passe-t-il ?
            </label>
            <textarea
              id={`${orientId}-texte`}
              rows={2}
              autoFocus
              value={probleme}
              onChange={(e) => setProbleme(e.target.value)}
              placeholder="Ex. : fuite sous l’évier, le disjoncteur saute, porte claquée…"
              className="form-input resize-none"
            />
            {!probleme.trim() && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className="text-[13px] text-[var(--gray-500)] mr-0.5">Exemples :</span>
                {EXEMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setProbleme(ex)}
                    className="rounded-full px-3 py-1.5 text-[13px] font-medium cursor-pointer bg-[var(--gray-100)] text-[var(--gray-700)] border border-transparent hover:border-[var(--gray-300)] transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
            <div aria-live="polite" className="mt-3 min-h-[44px]">
              {suggestions.length > 0 && (
                <>
                  <p className="text-[13px] text-[var(--gray-500)] mb-2">
                    {suggestions.length === 1 ? 'Le métier qu’il te faut :' : 'Les métiers qui correspondent :'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((m, i) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => doSearch(m)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold cursor-pointer transition-all border min-h-11 ${
                          i === 0
                            ? 'bg-[var(--orange)] text-white border-[var(--orange)] hover:bg-[var(--orange-dark)]'
                            : 'bg-white text-[var(--dark)] border-[var(--gray-300)] hover:border-[var(--dark)]'
                        }`}
                      >
                        {m}
                        <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {showNoMatch && (
                <>
                  <p className="text-[13px] text-[var(--gray-500)] mb-2">
                    On n’a pas reconnu le métier. Choisis dans la liste :
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {METIERS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => doSearch(m)}
                        className="rounded-full px-3 py-1.5 text-[13px] font-medium cursor-pointer bg-[var(--gray-100)] text-[var(--gray-700)] border border-transparent hover:border-[var(--gray-300)] transition-colors"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

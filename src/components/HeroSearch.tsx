'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CityAutocomplete from './CityAutocomplete'

export default function HeroSearch() {
  const router = useRouter()
  const [metier, setMetier] = useState('')
  const [ville, setVille] = useState('')
  const [urgence, setUrgence] = useState(false)

  function doSearch() {
    const params = new URLSearchParams()
    if (metier.trim()) params.set('metier', metier.trim())
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
            value={metier}
            onChange={(e) => setMetier(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-none outline-none text-base w-full bg-transparent text-[var(--dark)] placeholder:text-[var(--gray-500)]"
          />
        </div>

        <div className="w-px h-8 bg-[var(--gray-300)] shrink-0 max-[900px]:w-full max-[900px]:h-px" />

        {/* City input */}
        <CityAutocomplete value={ville} onChange={setVille} />

        {/* Search button */}
        <button
          onClick={doSearch}
          className="bg-[var(--orange)] text-white border-none px-8 py-3.5 rounded-[14px] font-sora font-bold text-[15px] cursor-pointer transition-all shrink-0 flex items-center gap-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.35)] max-[900px]:w-full max-[900px]:justify-center"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          Chercher
        </button>
      </div>

      {/* Urgence toggle */}
      <label className="flex items-center gap-3 mt-4 cursor-pointer select-none animate-fade-up delay-5">
        <input
          type="checkbox"
          checked={urgence}
          onChange={(e) => setUrgence(e.target.checked)}
          className="hidden"
        />
        <span className={`w-11 h-6 rounded-full relative transition-colors ${urgence ? 'bg-[var(--red)]' : 'bg-[var(--gray-300)]'}`}>
          <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${urgence ? 'translate-x-5' : ''}`} />
        </span>
        <span className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${urgence ? 'text-[var(--red)]' : 'text-[var(--gray-700)]'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" className={`transition-colors ${urgence ? 'text-[var(--red)]' : 'text-[var(--gray-500)]'}`}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Urgence — Artisan disponible maintenant
        </span>
      </label>

      {/* AI assist */}
      <div className="mt-5 animate-fade-up delay-6 relative z-[1]">
        <button className="inline-flex items-center gap-2.5 bg-[var(--dark)] text-white border-none px-6 py-3 rounded-full text-sm font-medium cursor-pointer transition-all hover:bg-[var(--dark-mid)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(26,26,46,0.25)] max-[900px]:text-[13px] max-[900px]:px-5 max-[900px]:min-h-11">
          <span className="text-base animate-sparkle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z" /></svg>
          </span>
          Pas sûr du métier ? Décris ton problème, on t&apos;oriente
        </button>
      </div>
    </>
  )
}

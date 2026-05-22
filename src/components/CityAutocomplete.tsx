'use client'

import { useState, useRef, useEffect } from 'react'

const CITIES = [
  'Lausanne', 'Renens', 'Pully', 'Prilly', 'Morges', 'Nyon',
  'Vevey', 'Montreux', 'Yverdon-les-Bains', 'Ecublens', 'Bussigny',
  'Crissier', 'Lutry', 'Payerne', 'Aigle', 'Rolle', 'Gland',
  'Chavannes-près-Renens', 'Le Mont-sur-Lausanne', 'Epalinges',
]

type Props = {
  value: string
  onChange: (value: string) => void
}

export default function CityAutocomplete({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = value.trim()
    ? CITIES.filter((c) => c.toLowerCase().includes(value.toLowerCase()))
    : CITIES

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

  function selectCity(city: string) {
    onChange(city)
    setOpen(false)
    setOverlayOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      e.stopPropagation()
      selectCity(filtered[activeIndex])
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
          className="border-none outline-none text-base w-full bg-transparent text-[var(--dark)] placeholder:text-[var(--gray-500)]"
        />

        {/* Desktop dropdown */}
        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 right-0 min-w-[280px] bg-white rounded-[var(--radius-sm)] shadow-[0_8px_40px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] max-h-60 overflow-y-auto z-[9999] p-1.5">
            {filtered.length === 0 ? (
              <div className="p-3.5 text-sm text-[var(--gray-500)] text-center">Aucune ville trouvée</div>
            ) : (
              filtered.map((city, i) => (
                <div
                  key={city}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-xs)] cursor-pointer transition-colors text-[15px] text-[var(--dark)] ${i === activeIndex ? 'bg-[var(--orange)] text-white' : 'hover:bg-[var(--orange)] hover:text-white'}`}
                  onMouseDown={(e) => { e.preventDefault(); selectCity(city) }}
                >
                  {pinIcon}
                  <span>{city}</span>
                </div>
              ))
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
              placeholder="Rechercher une ville..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoFocus
              autoComplete="off"
              className="flex-1 border-none outline-none text-lg text-[var(--dark)] bg-transparent placeholder:text-[var(--gray-500)]"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2 overscroll-contain">
            {filtered.length === 0 ? (
              <div className="p-3.5 text-sm text-[var(--gray-500)] text-center">Aucune ville trouvée</div>
            ) : (
              filtered.map((city) => (
                <div
                  key={city}
                  onClick={() => selectCity(city)}
                  className="flex items-center gap-2.5 px-4 py-3.5 rounded-[var(--radius-xs)] cursor-pointer text-base text-[var(--dark)] hover:bg-[var(--orange)] hover:text-white transition-colors"
                >
                  {pinIcon}
                  <span>{city}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}

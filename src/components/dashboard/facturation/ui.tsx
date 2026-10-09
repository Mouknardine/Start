'use client'

import type { ReactNode } from 'react'
import DecimalInput from '@/components/ui/DecimalInput'
import type { Ton, Categorie } from '@/lib/facturation'

// Éléments d'interface partagés par les écrans de facturation et de profil.

export const TON_CLASSES: Record<Ton, string> = {
  neutre: 'bg-[var(--gray-100)] text-[var(--gray-700)]',
  info: 'bg-[var(--blue-light)] text-[var(--blue)]',
  succes: 'bg-[var(--green-light)] text-[var(--green)]',
  alerte: 'bg-[var(--red-light)] text-[var(--red)]',
  action: 'bg-[rgba(232,112,10,0.12)] text-[var(--orange-dark)]',
}

// Classes composées sans doublon de propriété : avec Tailwind, deux classes
// qui règlent la même propriété (bg-…, h-…) ne se surchargent pas dans l'ordre écrit.
export const INPUT_CORE = 'w-full border bg-white text-base text-[var(--dark)] outline-none transition-shadow focus:border-[var(--orange)] focus:shadow-[0_0_0_4px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)]'
export function inputCls({ h = 'h-12', px = 'px-3.5', rounded = 'rounded-xl', invalid = false, extra = '' } = {}): string {
  return `${INPUT_CORE} ${h} ${px} ${rounded} ${invalid ? 'border-[var(--red)]' : 'border-[var(--gray-200)]'} ${extra}`
}
export const INPUT = inputCls()
export const LABEL = 'block text-[13px] font-semibold text-[var(--gray-700)] mb-1.5'
export const CARD = 'bg-white rounded-[20px] border border-[var(--gray-200)] p-5 max-[600px]:p-4'
export const BTN_SIZES = { md: 'h-12 px-5 text-[15px]', tight: 'h-12 px-3 text-[15px]', sm: 'h-10 px-4 text-sm' }
export const BTN_VARIANTS = {
  primary: 'font-bold bg-[var(--orange)] text-white hover:bg-[var(--orange-dark)]',
  success: 'font-bold bg-[var(--green)] text-white hover:bg-[#1B5E20]',
  danger: 'font-bold bg-[var(--red)] text-white hover:bg-[#B71C1C]',
  secondary: 'font-semibold bg-[var(--gray-100)] text-[var(--dark)] hover:bg-[var(--gray-200)]',
  dangerSoft: 'font-semibold bg-[var(--gray-100)] text-[var(--red)] hover:bg-[var(--red-light)]',
}
export function btn(variant: keyof typeof BTN_VARIANTS = 'primary', size: keyof typeof BTN_SIZES = 'md'): string {
  return `inline-flex items-center justify-center gap-2 rounded-full border-none cursor-pointer transition-colors disabled:opacity-60 ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]}`
}
export const BTN_PRIMARY = btn('primary')
export const BTN_SECONDARY = btn('secondary')
export const ICON_BTN = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-transparent border-none cursor-pointer transition-colors hover:bg-[var(--gray-100)]'
// Barre de titre des sous-écrans : collée en haut sur mobile, simple en-tête sur ordinateur
export const SUBBAR = 'sticky top-0 z-40 -mx-4 px-2 py-2 mb-3 flex items-center gap-1 bg-[rgba(249,250,251,0.94)] backdrop-blur-[16px] border-b border-[var(--gray-200)] min-[600px]:-mx-5 min-[600px]:px-3 min-[900px]:static min-[900px]:mx-0 min-[900px]:px-0 min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:backdrop-blur-none'

// ===== Icônes =====

export function Ico({ children, className = 'w-5 h-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
export const IconPlus = ({ className }: { className?: string }) => <Ico className={className}><path d="M12 5v14M5 12h14" /></Ico>
export const IconBack = () => <Ico className="w-6 h-6"><polyline points="15 18 9 12 15 6" /></Ico>
export const IconDots = () => <Ico><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Ico>
export const IconEye = () => <Ico><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Ico>
export const IconTrash = ({ className }: { className?: string }) => <Ico className={className}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Ico>
export const IconDoc = ({ className }: { className?: string }) => <Ico className={className}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></Ico>
export const IconInvoice = ({ className }: { className?: string }) => <Ico className={className}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Ico>
export const IconBook = ({ className }: { className?: string }) => <Ico className={className}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></Ico>
export const IconDownload = ({ className }: { className?: string }) => <Ico className={className}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Ico>
export const IconCopy = ({ className }: { className?: string }) => <Ico className={className}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Ico>
export const IconCheck = ({ className }: { className?: string }) => <Ico className={className}><polyline points="20 6 9 17 4 12" /></Ico>
export const IconSearch = ({ className }: { className?: string }) => <Ico className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Ico>

export function DocTile({ type, className = 'w-11 h-11' }: { type: 'devis' | 'facture'; className?: string }) {
  return (
    <span className={`${className} shrink-0 rounded-2xl flex items-center justify-center ${type === 'devis' ? 'bg-[rgba(232,112,10,0.12)] text-[var(--orange)]' : 'bg-[var(--blue-light)] text-[var(--blue)]'}`}>
      {type === 'devis' ? <IconDoc /> : <IconInvoice />}
    </span>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 p-1 rounded-full bg-[var(--gray-100)]">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-9 px-3 rounded-full text-[13px] font-semibold border-none cursor-pointer whitespace-nowrap transition-all ${value === o.value ? 'bg-white text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'bg-transparent text-[var(--gray-500)]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const IconClock = ({ className }: { className?: string }) => <Ico className={className}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Ico>
export const IconBox = ({ className }: { className?: string }) => <Ico className={className}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Ico>
export const IconTruck = ({ className }: { className?: string }) => <Ico className={className}><rect x="1" y="3" width="15" height="13" rx="1" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></Ico>
export const IconTag = ({ className }: { className?: string }) => <Ico className={className}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></Ico>
export const IconSettings = ({ className }: { className?: string }) => <Ico className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></Ico>
export const IconChevron = ({ className }: { className?: string }) => <Ico className={className}><polyline points="9 18 15 12 9 6" /></Ico>

export const CAT_STYLE: Record<Categorie, string> = {
  main_oeuvre: 'bg-[rgba(232,112,10,0.12)] text-[var(--orange)]',
  materiel: 'bg-[var(--blue-light)] text-[var(--blue)]',
  deplacement: 'bg-[var(--green-light)] text-[var(--green)]',
  forfait: 'bg-[var(--gray-100)] text-[var(--gray-700)]',
}

export function CatIcon({ categorie, className = 'w-5 h-5' }: { categorie: Categorie; className?: string }) {
  if (categorie === 'main_oeuvre') return <IconClock className={className} />
  if (categorie === 'materiel') return <IconBox className={className} />
  if (categorie === 'deplacement') return <IconTruck className={className} />
  return <IconTag className={className} />
}

export function CatTile({ categorie, className = 'w-10 h-10' }: { categorie: Categorie; className?: string }) {
  return (
    <span className={`${className} shrink-0 rounded-xl flex items-center justify-center ${CAT_STYLE[categorie]}`}>
      <CatIcon categorie={categorie} />
    </span>
  )
}

/** Compteur − valeur + (quantités, personnes). */
export function Stepper({ value, onChange, step = 1, min = 0, label, format = String, editable = false }: {
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  label: string
  format?: (n: number) => string
  /** Valeur tapable au clavier (quantités décimales : 2.5 m²) */
  editable?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center w-full min-w-0 h-12 rounded-xl border border-[var(--gray-200)] bg-white overflow-hidden">
      <button type="button" aria-label={`${label} : moins`} onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        className="w-12 h-full shrink-0 text-2xl leading-none text-[var(--gray-700)] bg-transparent border-none cursor-pointer hover:bg-[var(--gray-100)] disabled:opacity-30" disabled={value <= min}>−</button>
      {editable ? (
        <DecimalInput value={value} onValue={n => onChange(Math.max(min, n))} aria-label={label}
          className="flex-1 min-w-0 h-full text-center text-[17px] font-bold text-[var(--dark)] bg-transparent border-none outline-none tabular-nums" />
      ) : (
        <span className="flex-1 text-center text-[17px] font-bold text-[var(--dark)] tabular-nums" aria-live="polite">{format(value)}</span>
      )}
      <button type="button" aria-label={`${label} : plus`} onClick={() => onChange(Math.round((value + step) * 100) / 100)}
        className="w-12 h-full shrink-0 text-2xl leading-none text-[var(--gray-700)] bg-transparent border-none cursor-pointer hover:bg-[var(--gray-100)]">+</button>
    </div>
  )
}

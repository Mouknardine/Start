'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Logo from '@/components/Logo'
import ReportButton from '@/components/ReportButton'
import AuthNavButton from '@/components/AuthNavButton'
import OwnerBanner from '@/components/OwnerBanner'
import { createClient } from '@/lib/supabase/client'
import type { Artisan, Avis } from '@/lib/supabase/helpers'
import { getMonday, formatDateStr, summarizeWeekAvailability, formatNextSlot, type DispoData, type WeekAvailability } from '@/lib/availability'
import { telHref } from '@/lib/phone'

type Props = {
  artisanId: string
  initialProfile: Artisan
  initialReviews: Avis[]
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function generateStars(score: number) {
  const full = Math.floor(score)
  const hasHalf = score - full >= 0.5
  let s = ''
  for (let i = 0; i < 5; i++) {
    if (i < full) s += '\u2605'
    else if (i === full && hasHalf) s += '\u2605'
    else s += '\u2606'
  }
  return s
}

type BookedSlot = { creneau_date: string; creneau_heure: string }

export default function ArtisanProfileClient({ artisanId, initialProfile, initialReviews }: Props) {
  const [profile] = useState<Artisan>(initialProfile)
  const [reviews] = useState<Avis[]>(initialReviews)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('presentation')
  const [weekOffset, setWeekOffset] = useState(0)
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([])
  // Résumé « prochain créneau » : calculé après le montage, à l'heure locale du
  // visiteur (le rendu serveur est en UTC → pas de décalage d'hydratation).
  const [weekSummary, setWeekSummary] = useState<{ summary: WeekAvailability; now: Date } | null>(null)
  const [showAllReviews, setShowAllReviews] = useState(false)

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)

  // Computed rating
  const avgRating = reviews.length > 0
    ? Math.round(reviews.reduce((s, r) => s + (r.note || 0), 0) / reviews.length * 10) / 10
    : 0
  const starsDisplay = generateStars(avgRating)
  // Répartition des notes 5 → 1 (histogramme du résumé des avis)
  const ratingCounts = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => Math.round(r.note || 0) === n).length }))
  const REVIEWS_PREVIEW = 5
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, REVIEWS_PREVIEW)

  // Charger les créneaux réservés côté client (données dynamiques en temps réel)
  useEffect(() => {
    if (!artisanId) return
    const supabase = createClient()
    supabase.rpc('get_booked_slots', { p_artisan_id: artisanId }).then(({ data }) => {
      if (data) setBookedSlots(data as BookedSlot[])
    })
  }, [artisanId])

  useEffect(() => {
    const now = new Date()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekSummary({ summary: summarizeWeekAvailability(initialProfile.disponibilites, now), now })
  }, [initialProfile.disponibilites])

  // Keyboard for lightbox
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!lightboxOpen) return
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowLeft') setLightboxIdx(i => (i - 1 + galleryUrls.length) % galleryUrls.length)
      if (e.key === 'ArrowRight') setLightboxIdx(i => (i + 1) % galleryUrls.length)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const scrollToSection = useCallback((id: string) => {
    setActiveTab(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const p = profile
  const name = p.entreprise || `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Artisan'
  const galleryUrls = p.gallery_urls || []

  // Availability computation
  const dispo = p.disponibilites as DispoData | null
  const monday = getMonday(new Date())
  monday.setDate(monday.getDate() + weekOffset * 7)
  const mondayStr = formatDateStr(monday)

  const endOfWeek = new Date(monday)
  endOfWeek.setDate(monday.getDate() + 6)

  let weekLabel: string
  if (monday.getMonth() === endOfWeek.getMonth()) {
    weekLabel = `Semaine du ${monday.getDate()} au ${endOfWeek.getDate()} ${MOIS_FR[monday.getMonth()]}`
  } else {
    weekLabel = `Semaine du ${monday.getDate()} ${MOIS_COURT[monday.getMonth()]} au ${endOfWeek.getDate()} ${MOIS_COURT[endOfWeek.getMonth()]}`
  }

  const isV2 = dispo?.version === 2
  const blockedDays = (isV2 && dispo?.blocked_days) ? dispo.blocked_days : []
  const hasAgendaData = !!(dispo?.slots && Object.keys(dispo.slots).length > 0 && dispo.week_start === mondayStr)

  // Build availability days
  const availDays = JOURS_FR.map((jourNom, idx) => {
    const currentDate = new Date(monday)
    currentDate.setDate(monday.getDate() + idx)
    const dateStr = `${currentDate.getDate()} ${MOIS_COURT[currentDate.getMonth()]}`
    const fullDateStr = formatDateStr(currentDate)

    if (blockedDays.includes(fullDateStr)) {
      return { jourNom, dateStr, fullDateStr, blocked: true, slots: [] as string[], closed: false }
    }

    if (hasAgendaData && dispo?.slots) {
      const colSlots = dispo.slots[String(idx)]
      const ranges: { start: number; end: number }[] = []
      if (colSlots) {
        const rows = Object.keys(colSlots).map(Number).sort((a, b) => a - b)
        let rangeStart: { start: number; end: number } | null = null
        rows.forEach(row => {
          if (colSlots[String(row)] === 'available') {
            const totalMinutes = 8 * 60 + row * 30
            if (!rangeStart) {
              rangeStart = { start: totalMinutes, end: totalMinutes + 30 }
            } else if (totalMinutes === rangeStart.end) {
              rangeStart.end = totalMinutes + 30
            } else {
              ranges.push(rangeStart)
              rangeStart = { start: totalMinutes, end: totalMinutes + 30 }
            }
          }
        })
        if (rangeStart) ranges.push(rangeStart)
      }

      const slotLabels = ranges.map(r => {
        const hS = Math.floor(r.start / 60), mS = r.start % 60
        const hE = Math.floor(r.end / 60), mE = r.end % 60
        return `${hS}h${mS === 0 ? '00' : String(mS).padStart(2, '0')} - ${hE}h${mE === 0 ? '00' : String(mE).padStart(2, '0')}`
      })

      return { jourNom, dateStr, fullDateStr, blocked: false, slots: slotLabels, closed: slotLabels.length === 0 }
    }

    return { jourNom, dateStr, fullDateStr, blocked: false, slots: [], closed: true }
  })

  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-[100] py-4 px-10 flex items-center justify-between bg-[rgba(250,250,250,0.9)] backdrop-blur-[20px] border-b border-black/5 max-[960px]:px-4 max-[960px]:py-3 max-[500px]:px-3 max-[500px]:py-2.5">
        <Logo />
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="hidden max-[960px]:block bg-none border-none cursor-pointer p-2 text-[var(--dark)]"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          aria-controls="profil-menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>
        <div className="flex items-center gap-6 max-[960px]:hidden">
          <Link href="/recherche" className="text-[var(--gray-700)] no-underline text-sm font-medium flex items-center gap-1.5 hover:text-[var(--dark)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Retour aux résultats
          </Link>
          <AuthNavButton variant="dark" />
        </div>
        {menuOpen && (
          <div id="profil-menu" className="hidden max-[960px]:flex fixed top-[60px] left-0 right-0 bg-white flex-col p-6 gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)] border-b border-[var(--gray-200)] z-[99]">
            <Link href="/recherche" className="text-[var(--gray-700)] no-underline text-sm font-medium hover:text-[var(--dark)]">Retour aux résultats</Link>
            <Link href="/" className="text-[var(--gray-700)] no-underline text-sm font-medium hover:text-[var(--dark)]">Accueil</Link>
            <AuthNavButton variant="dark" />
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="pt-20 bg-white border-b border-[var(--gray-200)]">
        <div className="max-w-[1100px] mx-auto pt-10 px-10 max-[960px]:pt-6 max-[960px]:px-4 max-[500px]:pt-4 max-[500px]:px-3">
          <OwnerBanner artisanId={artisanId} />
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[13px] text-[var(--gray-500)] mb-7 max-[960px]:text-xs max-[960px]:mb-5 max-[960px]:overflow-x-auto max-[960px]:whitespace-nowrap max-[960px]:scrollbar-none">
            <Link href="/" className="text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">Accueil</Link>
            <span>›</span>
            <Link href={`/recherche?metier=${encodeURIComponent(p.metier || '')}`} className="text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">{p.metier || 'Artisan'}</Link>
            <span>›</span>
            <span className="text-[var(--dark)] font-medium">{name}</span>
          </div>

          {/* Profile top */}
          <div className="flex gap-8 items-start pb-8 max-[960px]:flex-col max-[960px]:items-start max-[960px]:gap-4 max-[960px]:pb-6 max-[500px]:gap-3 max-[500px]:pb-5" style={{ animation: 'fadeIn 0.6s ease-out both' }}>
            {/* Avatar */}
            <div className="w-[120px] h-[120px] bg-gradient-to-br from-[var(--dark)] to-[var(--dark-mid)] rounded-[20px] flex items-center justify-center shrink-0 relative overflow-hidden max-[960px]:w-20 max-[960px]:h-20 max-[960px]:rounded-2xl max-[500px]:w-16 max-[500px]:h-16 max-[500px]:rounded-[14px]">
              {p.avatar_url ? (
                <Image src={p.avatar_url} alt={name} fill priority sizes="(max-width: 500px) 64px, (max-width: 960px) 80px, 120px" className="object-cover rounded-[20px] max-[960px]:rounded-2xl max-[500px]:rounded-[14px]" />
              ) : (
                <svg className="w-12 h-12 max-[960px]:w-8 max-[960px]:h-8 max-[500px]:w-[26px] max-[500px]:h-[26px]" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
              )}
              {p.ide_verified && <div title="Entreprise vérifiée au registre IDE" className="absolute -bottom-1.5 -right-1.5 bg-[var(--green)] text-white w-8 h-8 rounded-full flex items-center justify-center border-[3px] border-white max-[960px]:w-[26px] max-[960px]:h-[26px] max-[960px]:-bottom-1 max-[960px]:-right-1 max-[500px]:w-[22px] max-[500px]:h-[22px]">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </div>}
            </div>

            {/* Header info */}
            <div className="flex-1">
              <h1 className="font-sora text-[32px] font-extrabold mb-1.5 max-[960px]:text-[22px] max-[500px]:text-xl">{name}</h1>
              <div className="text-[var(--orange)] font-bold text-[15px] uppercase tracking-wider mb-3 max-[960px]:text-[13px] max-[500px]:text-xs max-[500px]:mb-2">{p.metier || 'Artisan'}</div>

              <div className="flex flex-wrap gap-5 mb-4 max-[960px]:gap-3 max-[500px]:gap-2">
                {p.zones && p.zones.length > 0 && (
                  <div className="flex items-center gap-2 text-[15px] text-[var(--gray-700)] max-[960px]:text-[13px] max-[500px]:text-xs max-[500px]:gap-1">
                    <svg className="w-[18px] h-[18px] text-[var(--gray-500)] shrink-0 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    {p.zones[0]} et environs
                  </div>
                )}
                {p.telephone && (
                  <div className="flex items-center gap-2 text-[15px] text-[var(--gray-700)] max-[960px]:text-[13px] max-[500px]:text-xs max-[500px]:gap-1">
                    <svg className="w-[18px] h-[18px] text-[var(--gray-500)] shrink-0 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                    {p.telephone}
                  </div>
                )}
                {weekSummary?.summary.next && (
                  <a href="#disponibilites" onClick={(e) => { e.preventDefault(); scrollToSection('disponibilites') }} className="flex items-center gap-2 text-[15px] text-[var(--green)] font-semibold no-underline hover:underline max-[960px]:text-[13px] max-[500px]:text-xs max-[500px]:gap-1">
                    <svg aria-hidden="true" className="w-[18px] h-[18px] shrink-0 max-[500px]:w-3.5 max-[500px]:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    Prochain créneau : {formatNextSlot(weekSummary.summary.next, weekSummary.now)}
                  </a>
                )}
              </div>

              {/* Rating */}
              <div className="flex items-center gap-3 mt-1">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={`text-xl ${i < Math.round(avgRating) ? 'text-[#F0B429]' : 'text-[var(--gray-300)]'}`}>{'\u2605'}</span>
                  ))}
                </div>
                <span className="font-sora font-extrabold text-[22px] max-[960px]:text-xl max-[500px]:text-lg">{reviews.length > 0 ? avgRating.toFixed(1) : '\u2014'}</span>
                <span className="text-sm text-[var(--gray-500)] max-[500px]:text-xs">· {reviews.length} avis vérifiés</span>
    {p.ide_verified && (
      <span title={p.ide_company_name ? `Entreprise vérifiée : ${p.ide_company_name}` : "Entreprise vérifiée"} className="inline-flex items-center gap-1 bg-[var(--green-light)] text-[var(--green)] py-1 px-2.5 rounded-full text-[11px] font-bold"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Vérifié IDE</span>
    )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 shrink-0 max-[960px]:flex-col max-[960px]:w-full max-[960px]:gap-2">
              <Link
                href={`/demande?artisan=${artisanId}`}
                className="bg-[var(--orange)] text-white py-3.5 px-8 rounded-full font-sora font-bold text-[15px] border-none cursor-pointer transition-all text-center no-underline flex items-center justify-center gap-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.35)] max-[960px]:w-full max-[960px]:py-3.5 max-[960px]:px-6"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                Contacter
              </Link>
              {p.urgence && p.telephone && (
                <a
                  href={telHref(p.telephone)}
                  className="inline-flex items-center gap-2 bg-gradient-to-br from-[#D32F2F] to-[#B71C1C] text-white py-2.5 px-5 rounded-full font-sora font-bold text-[13px] tracking-wider no-underline shadow-[0_2px_12px_rgba(211,47,47,0.25)] max-[960px]:justify-center max-[960px]:text-xs max-[960px]:py-2 max-[960px]:px-4"
                >
                  <span className="w-2 h-2 bg-[#FF8A80] rounded-full animate-pulse" />
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                  Urgence — Appeler maintenant
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-[1100px] mx-auto px-10 flex gap-0 bg-white max-[960px]:px-4 max-[960px]:overflow-x-auto max-[960px]:scrollbar-none max-[500px]:px-3">
          {[
            { id: 'presentation', label: 'Présentation' },
            { id: 'disponibilites', label: 'Disponibilités' },
            ...(galleryUrls.length > 0 ? [{ id: 'galerie', label: 'Galerie' }] : []),
            { id: 'avis', label: `Avis (${reviews.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => scrollToSection(tab.id)}
              className={`py-4 px-6 text-[15px] font-semibold cursor-pointer border-b-[3px] transition-all select-none whitespace-nowrap max-[960px]:py-3.5 max-[960px]:px-4.5 max-[960px]:text-sm max-[500px]:py-3.5 max-[500px]:px-4 max-[500px]:text-[13px] max-[500px]:min-h-11 ${
                activeTab === tab.id
                  ? 'text-[var(--orange)] border-[var(--orange)]'
                  : 'text-[var(--gray-500)] border-transparent hover:text-[var(--dark)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* CONTENT */}
      <div className="max-w-[1100px] mx-auto py-8 px-10 pb-20 grid grid-cols-[1fr_380px] gap-8 items-start max-[960px]:grid-cols-1 max-[960px]:gap-5 max-[960px]:px-4 max-[960px]:py-6 max-[960px]:pb-[100px] max-[500px]:px-3 max-[500px]:py-4 max-[500px]:pb-[100px] max-[500px]:gap-4 w-full">
        {/* LEFT */}
        <div className="flex flex-col gap-8 max-[960px]:gap-5 max-[500px]:gap-4">
          {/* Description */}
          <div className="bg-white rounded-[var(--radius)] p-7 border border-[var(--gray-200)] max-[960px]:p-5 max-[500px]:p-4 max-[500px]:rounded-xl" id="presentation">
            <div className="font-sora text-xl font-bold mb-5 flex items-center gap-2.5 max-[960px]:text-lg max-[960px]:mb-4 max-[500px]:text-base max-[500px]:gap-2">
              <svg className="w-[22px] h-[22px] text-[var(--orange)] max-[500px]:w-[18px] max-[500px]:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              À propos
            </div>
            <div className="text-[15px] leading-[1.75] text-[var(--gray-700)] max-[500px]:text-sm max-[500px]:leading-relaxed whitespace-pre-line">
              {p.description || 'Aucune description disponible.'}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--gray-100)]">
              <ReportButton cibleType="artisan" cibleId={artisanId} size="md" />
            </div>
          </div>

          {/* Spécialités */}
          {p.specialites && p.specialites.length > 0 && (
            <div className="bg-white rounded-[var(--radius)] p-7 border border-[var(--gray-200)] max-[960px]:p-5 max-[500px]:p-4 max-[500px]:rounded-xl">
              <div className="font-sora text-xl font-bold mb-5 flex items-center gap-2.5 max-[960px]:text-lg max-[960px]:mb-4 max-[500px]:text-base max-[500px]:gap-2">
                <svg className="w-[22px] h-[22px] text-[var(--orange)] max-[500px]:w-[18px] max-[500px]:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                Spécialités
              </div>
              <div className="flex flex-wrap gap-2.5 max-[960px]:gap-2">
                {p.specialites.map((s, i) => (
                  <span key={i} className="bg-[var(--gray-100)] py-2.5 px-4.5 rounded-full text-sm font-medium text-[var(--dark)] transition-all hover:bg-[var(--orange)] hover:text-white hover:-translate-y-px max-[960px]:py-2 max-[960px]:px-3.5 max-[960px]:text-[13px] max-[500px]:py-[7px] max-[500px]:px-3 max-[500px]:text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Zone d'intervention */}
          {p.zones && p.zones.length > 0 && (
            <div className="bg-white rounded-[var(--radius)] p-7 border border-[var(--gray-200)] max-[960px]:p-5 max-[500px]:p-4 max-[500px]:rounded-xl">
              <div className="font-sora text-xl font-bold mb-5 flex items-center gap-2.5 max-[960px]:text-lg max-[960px]:mb-4 max-[500px]:text-base max-[500px]:gap-2">
                <svg className="w-[22px] h-[22px] text-[var(--orange)] max-[500px]:w-[18px] max-[500px]:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                Zone d&apos;intervention
              </div>
              <div className="flex flex-wrap gap-2 max-[500px]:gap-1.5">
                {p.zones.map((z, i) => (
                  <span key={i} className="bg-[var(--blue-light)] text-[var(--blue)] py-2 px-4 rounded-full text-[13px] font-semibold max-[960px]:py-1.5 max-[960px]:px-3 max-[960px]:text-xs max-[500px]:py-[5px] max-[500px]:px-2.5 max-[500px]:text-[11px]">{z}</span>
                ))}
              </div>
              <div className="mt-4 text-sm text-[var(--gray-500)] flex items-center gap-2 max-[500px]:text-xs">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                Déplacement possible dans d&apos;autres communes sur demande
              </div>
            </div>
          )}

          {/* Galerie */}
          {galleryUrls.length > 0 && (
            <div className="bg-white rounded-[var(--radius)] p-7 border border-[var(--gray-200)] max-[960px]:p-5 max-[500px]:p-4 max-[500px]:rounded-xl" id="galerie">
              <div className="font-sora text-xl font-bold mb-5 flex items-center gap-2.5 max-[960px]:text-lg max-[960px]:mb-4 max-[500px]:text-base max-[500px]:gap-2">
                <svg className="w-[22px] h-[22px] text-[var(--orange)] max-[500px]:w-[18px] max-[500px]:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                Galerie de réalisations
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-2xl overflow-hidden cursor-pointer max-[960px]:grid-cols-1" style={{ gridTemplateRows: '240px 120px' }}>
                <div className="row-span-2 relative overflow-hidden max-[960px]:row-span-1 max-[960px]:h-[220px]" onClick={() => { setLightboxIdx(0); setLightboxOpen(true) }}>
                  <Image src={galleryUrls[0]} alt="Réalisation 1" fill sizes="(max-width: 960px) 100vw, 600px" className="object-cover transition-transform hover:scale-105" />
                </div>
                {galleryUrls.slice(1, 3).map((url, i) => (
                  <div key={url} className="relative overflow-hidden max-[960px]:hidden" onClick={() => { setLightboxIdx(i + 1); setLightboxOpen(true) }}>
                    <Image src={url} alt={`Réalisation ${i + 2}`} fill sizes="300px" className="object-cover transition-transform hover:scale-105" />
                    {i === 1 && galleryUrls.length > 3 && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white font-sora font-bold text-base gap-1.5 hover:bg-black/70 transition-all">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        +{galleryUrls.length - 3} photos
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Avis */}
          <div className="bg-white rounded-[var(--radius)] p-7 border border-[var(--gray-200)] max-[960px]:p-5 max-[500px]:p-4 max-[500px]:rounded-xl" id="avis">
            <div className="flex items-center justify-between gap-3 mb-6 max-[960px]:mb-5">
              <div className="font-sora text-xl font-bold flex items-center gap-2.5 max-[960px]:text-lg max-[500px]:text-base max-[500px]:gap-2">
                <svg className="w-[22px] h-[22px] text-[var(--orange)] max-[500px]:w-[18px] max-[500px]:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                Avis clients
              </div>
              <Link href={`/avis?artisan=${artisanId}`} className="inline-flex items-center gap-1.5 py-2 px-4.5 bg-[var(--orange)] text-white rounded-full text-[13px] font-bold no-underline whitespace-nowrap transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                Laisser un avis
              </Link>
            </div>

            {/* Summary — note moyenne + répartition (modèle bella / Seed, via Mobbin) */}
            {reviews.length > 0 && (
              <div className="grid grid-cols-[auto_1fr] gap-8 items-center mb-6 p-5 bg-[var(--gray-50)] border border-[var(--gray-100)] rounded-[var(--radius-sm)] max-[500px]:grid-cols-1 max-[500px]:gap-4 max-[500px]:p-4">
                <div className="text-center min-w-[120px]">
                  <div className="font-sora text-5xl font-extrabold text-[var(--dark)] leading-none max-[500px]:text-4xl">
                    {avgRating.toFixed(1)}<span className="text-lg text-[var(--gray-500)] font-bold"> / 5</span>
                  </div>
                  <div aria-hidden="true" className="text-lg text-[#F0B429] mt-2 tracking-wider">{starsDisplay}</div>
                  <div className="text-[13px] text-[var(--gray-500)] mt-1">Basé sur {reviews.length} avis vérifiés</div>
                </div>
                <ul aria-label="Répartition des notes" className="list-none p-0 m-0 flex flex-col gap-1.5">
                  {ratingCounts.map(({ n, count }) => (
                    <li key={n} className="flex items-center gap-2.5 text-[13px]">
                      <span aria-hidden="true" className="w-7 shrink-0 font-semibold text-[var(--gray-700)]">{n} ★</span>
                      <span aria-hidden="true" className="flex-1 h-2 rounded-full bg-[var(--gray-200)] overflow-hidden">
                        <span className="block h-full rounded-full bg-[#F0B429]" style={{ width: `${Math.round((count / reviews.length) * 100)}%` }} />
                      </span>
                      <span aria-hidden="true" className="w-6 shrink-0 text-right text-[var(--gray-500)]">{count}</span>
                      <span className="sr-only">{n} étoile{n > 1 ? 's' : ''} : {count} avis</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Review list */}
            {visibleReviews.map((r, i) => {
              const d = r.created_at ? new Date(r.created_at) : null
              const dateStr = d ? `${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}` : ''
              const reviewStars = generateStars(r.note || 5)
              return (
                <div key={r.id} className={`py-5 ${i > 0 ? 'border-t border-[var(--gray-200)]' : ''} max-[960px]:py-4`}>
                  <div className="flex justify-between items-start mb-2 max-[960px]:flex-col max-[960px]:gap-1">
                    <div className="font-bold text-[15px] max-[500px]:text-sm">{r.client_nom || 'Client'}</div>
                    <div className="text-[13px] text-[var(--gray-500)] max-[500px]:text-xs">{dateStr}</div>
                  </div>
                  <div className="flex gap-px mb-2 text-sm text-[#F0B429] max-[500px]:text-[13px]">{reviewStars}</div>
                  <div className="text-sm leading-relaxed text-[var(--gray-700)] max-[500px]:text-[13px]">{r.commentaire}</div>
                  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--green)] bg-[var(--green-light)] py-1 px-3 rounded-full max-[500px]:text-[11px] max-[500px]:py-[3px] max-[500px]:px-2.5">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                      Avis vérifié
                    </div>
                    <ReportButton cibleType="avis" cibleId={r.id} />
                  </div>
                  {r.reponse_artisan && (
                    <div className="bg-[var(--gray-100)] rounded-[10px] p-3.5 px-4 mt-3 border-l-[3px] border-[var(--orange)]">
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-[var(--orange)]">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" /></svg>
                        Réponse de l&apos;artisan
                      </div>
                      <div className="text-[13px] leading-relaxed text-[var(--gray-700)]">{r.reponse_artisan}</div>
                    </div>
                  )}
                </div>
              )
            })}

            {reviews.length > REVIEWS_PREVIEW && (
              <div className="pt-4 border-t border-[var(--gray-200)] flex items-center justify-between gap-3 max-[500px]:flex-col max-[500px]:items-stretch">
                <span className="text-[13px] text-[var(--gray-500)]">{visibleReviews.length} avis affichés sur {reviews.length}</span>
                <button
                  type="button"
                  onClick={() => setShowAllReviews((v) => !v)}
                  className="py-2.5 px-5 rounded-full border border-[var(--gray-300)] bg-white text-[13px] font-semibold text-[var(--dark)] cursor-pointer transition-colors hover:border-[var(--dark)]"
                >
                  {showAllReviews ? 'Afficher moins' : `Voir les ${reviews.length - REVIEWS_PREVIEW} autres avis`}
                </button>
              </div>
            )}

            {reviews.length === 0 && (
              <div className="text-center py-6 px-4 bg-[var(--gray-50)] rounded-[var(--radius-sm)]">
                <div className="font-sora font-bold text-[15px] mb-1">Pas encore d’avis</div>
                <p className="text-[13px] text-[var(--gray-500)]">Vous avez fait appel à {name}&nbsp;? Votre avis aidera les prochains clients.</p>
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="flex flex-col gap-6 sticky top-[100px] max-[960px]:static max-[960px]:gap-5 max-[500px]:gap-4">
          {/* Disponibilités */}
          <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]" id="disponibilites">
            <div className="bg-gradient-to-br from-[var(--orange)] to-[#F5850A] py-5 px-6 text-white">
              <div className="font-sora text-lg font-bold mb-1 text-white max-[500px]:text-base">Disponibilités</div>
              <div className="text-[13px] text-white/80 max-[500px]:text-xs">Cliquez sur un créneau pour demander un rendez-vous</div>
            </div>

            <div className="flex justify-between items-center py-3.5 px-6 bg-[var(--gray-100)] border-b border-[var(--gray-200)]">
              <button onClick={() => setWeekOffset(w => w - 1)} className="bg-white border border-[var(--gray-200)] w-[34px] h-[34px] rounded-full cursor-pointer flex items-center justify-center transition-all text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:bg-[var(--orange)] hover:text-white hover:border-[var(--orange)] max-[500px]:w-11 max-[500px]:h-11">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="font-sora font-bold text-sm text-[var(--dark)] max-[500px]:text-[13px]">{weekLabel}</span>
              <button onClick={() => setWeekOffset(w => w + 1)} className="bg-white border border-[var(--gray-200)] w-[34px] h-[34px] rounded-full cursor-pointer flex items-center justify-center transition-all text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:bg-[var(--orange)] hover:text-white hover:border-[var(--orange)] max-[500px]:w-11 max-[500px]:h-11">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            <div className="flex flex-col">
              {availDays.map((day, i) => (
                <div key={i} className={`flex items-center py-3 px-6 border-b border-[var(--gray-100)] last:border-b-0 transition-colors hover:bg-[rgba(232,112,10,0.03)] max-[960px]:py-2 max-[960px]:px-2.5 max-[960px]:gap-2 max-[500px]:py-2 max-[500px]:px-2 max-[500px]:flex-wrap ${i % 2 === 0 ? 'bg-[rgba(0,0,0,0.01)]' : ''}`}>
                  <span className="font-bold text-[13px] min-w-[80px] text-[var(--dark)] uppercase tracking-wider max-[960px]:min-w-[70px] max-[500px]:min-w-[60px] max-[500px]:text-xs">{day.jourNom}</span>
                  <span className="text-xs text-[var(--gray-500)] min-w-[60px] max-[960px]:min-w-[48px] max-[500px]:min-w-[44px] max-[500px]:text-[11px]">{day.dateStr}</span>
                  {day.blocked ? (
                    <span className="flex-1 text-right text-xs italic text-[var(--red)] font-bold">Bloqué</span>
                  ) : day.slots.length > 0 ? (
                    <div className="flex flex-wrap gap-[5px] flex-1 justify-end max-[500px]:gap-1">
                      {day.slots.map((label, si) => {
                        const isBooked = bookedSlots.some(b => b.creneau_date === day.fullDateStr && b.creneau_heure === label)
                        return (
                          <Link
                            key={si}
                            href={isBooked ? '#' : `/demande?artisan=${artisanId}&jour=${encodeURIComponent(day.jourNom)}&date=${encodeURIComponent(day.dateStr)}&heure=${encodeURIComponent(label)}&fulldate=${encodeURIComponent(day.fullDateStr)}`}
                            onClick={e => { if (isBooked) e.preventDefault() }}
                            className={`py-1 px-2.5 rounded-[6px] text-[11px] font-bold border transition-all no-underline max-[500px]:py-1.5 max-[500px]:px-2.5 max-[500px]:text-xs max-[500px]:min-h-8 ${
                              isBooked
                                ? 'bg-[var(--gray-100)] text-[var(--gray-500)] cursor-not-allowed border-[var(--gray-200)] line-through opacity-60'
                                : 'bg-[var(--green-light)] text-[var(--green)] border-[rgba(56,142,60,0.15)] cursor-pointer hover:bg-[var(--green)] hover:text-white hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(56,142,60,0.25)]'
                            }`}
                            title={isBooked ? 'Ce créneau est déjà réservé' : ''}
                          >
                            {isBooked ? `${label} (réservé)` : label}
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="flex-1 text-right text-xs italic text-[var(--gray-500)]">{day.closed ? 'Indisponible' : '\u2014'}</span>
                  )}
                </div>
              ))}

              {!hasAgendaData && (
                <div className="text-center py-4 text-[var(--gray-500)] text-[13px] italic bg-[var(--gray-100)] rounded-lg mt-2 mx-6 mb-4">
                  Aucune disponibilité publiée pour cette semaine
                </div>
              )}
            </div>

            <div className="flex gap-4 py-3 px-6 border-t border-[var(--gray-200)] bg-[var(--gray-100)] max-[500px]:gap-2.5 max-[500px]:flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--gray-500)]">
                <span className="w-2.5 h-2.5 rounded bg-[var(--green-light)] border border-[var(--green)]" /> Disponible
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--gray-500)]">
                <span className="w-2.5 h-2.5 rounded bg-[var(--gray-200)] border border-[var(--gray-300)]" /> Non publié
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-[var(--radius)] p-6 border border-[var(--gray-200)] max-[960px]:p-5 max-[500px]:p-4">
            <div className="font-sora text-base font-bold mb-4 max-[500px]:text-[15px]">Coordonnées</div>
            {p.telephone && (
              <div className="flex items-center gap-3 py-3 border-t border-[var(--gray-100)] first:border-t-0 text-sm text-[var(--gray-700)] max-[500px]:text-xs max-[500px]:gap-2 max-[500px]:py-2.5">
                <svg className="w-[18px] h-[18px] text-[var(--gray-500)] shrink-0 max-[500px]:w-4 max-[500px]:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                <a href={telHref(p.telephone)} className="text-[var(--orange)] no-underline font-semibold hover:underline">{p.telephone}</a>
              </div>
            )}
            {p.email && (
              <div className="flex items-center gap-3 py-3 border-t border-[var(--gray-100)] text-sm text-[var(--gray-700)] max-[500px]:text-xs max-[500px]:gap-2 max-[500px]:py-2.5">
                <svg className="w-[18px] h-[18px] text-[var(--gray-500)] shrink-0 max-[500px]:w-4 max-[500px]:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                <a href={`mailto:${p.email}`} className="text-[var(--orange)] no-underline font-semibold hover:underline">{p.email}</a>
              </div>
            )}
            {p.adresse && (
              <div className="flex items-center gap-3 py-3 border-t border-[var(--gray-100)] text-sm text-[var(--gray-700)] max-[500px]:text-xs max-[500px]:gap-2 max-[500px]:py-2.5">
                <svg className="w-[18px] h-[18px] text-[var(--gray-500)] shrink-0 max-[500px]:w-4 max-[500px]:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {p.adresse}
              </div>
            )}
            {p.horaires && Array.isArray(p.horaires) && (
              <div className="flex items-start gap-3 py-3 border-t border-[var(--gray-100)] text-sm text-[var(--gray-700)] max-[500px]:text-xs max-[500px]:gap-2 max-[500px]:py-2.5">
                <svg className="w-[18px] h-[18px] text-[var(--gray-500)] shrink-0 mt-0.5 max-[500px]:w-4 max-[500px]:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                <div>
                  {(p.horaires as Array<{ jour: string; ouvert: boolean; debut?: string; fin?: string }>).filter(h => h.ouvert).map((h, i) => (
                    <div key={i}>{h.jour} : {h.debut} – {h.fin}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="bg-[var(--blue-light)] rounded-[var(--radius)] p-5 flex gap-3.5 items-start max-[960px]:p-4 max-[500px]:p-3.5 max-[500px]:gap-2.5">
            <svg className="w-5 h-5 text-[var(--blue)] shrink-0 mt-0.5 max-[500px]:w-[18px] max-[500px]:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <p className="text-[13px] leading-relaxed text-[var(--blue)] max-[500px]:text-xs">
              <strong className="font-bold">Tous les avis sont vérifiés.</strong> Seuls les clients ayant pris rendez-vous via Artisano et dont l&apos;intervention a été confirmée peuvent laisser un avis.
            </p>
          </div>
        </div>
      </div>

      {/* Barre d'action mobile : repères à gauche, action à droite (modèle Fresha / Mindtrip, via Mobbin) */}
      <div className="hidden max-[960px]:flex fixed bottom-0 left-0 right-0 bg-white px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] z-[90] items-center gap-3 max-[500px]:px-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--dark)]">
            {reviews.length > 0 ? (
              <>
                <span aria-hidden="true" className="text-[#F0B429]">★</span> {avgRating.toFixed(1)}
                <span className="font-normal text-[var(--gray-500)]"> · {reviews.length} avis</span>
              </>
            ) : (
              <span className="font-semibold text-[var(--gray-700)]">Pas encore d’avis</span>
            )}
          </div>
          <div className={`text-xs truncate ${weekSummary?.summary.next ? 'text-[var(--green)] font-semibold' : 'text-[var(--gray-500)]'}`}>
            {weekSummary?.summary.next
              ? `Prochain créneau : ${formatNextSlot(weekSummary.summary.next, weekSummary.now)}`
              : 'Disponibilités sur demande'}
          </div>
        </div>
        <Link
          href={`/demande?artisan=${artisanId}`}
          className="shrink-0 bg-[var(--orange)] text-white py-3 px-6 rounded-full font-sora font-bold text-sm no-underline flex items-center gap-2 transition-all hover:bg-[var(--orange-dark)] min-h-11"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          Contacter
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxOpen && galleryUrls.length > 0 && (
        <div
          ref={lightboxRef}
          className="fixed inset-0 bg-black z-[99999] flex flex-col"
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            const diff = e.changedTouches[0].clientX - touchStartX.current
            if (Math.abs(diff) > 50) setLightboxIdx(i => (i + (diff > 0 ? -1 : 1) + galleryUrls.length) % galleryUrls.length)
          }}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between py-3.5 px-5 z-10">
            <span className="font-sora font-semibold text-[15px] text-white bg-white/15 py-1.5 px-4.5 rounded-full">{lightboxIdx + 1} / {galleryUrls.length}</span>
            <button onClick={() => setLightboxOpen(false)} aria-label="Fermer la galerie" className="bg-white/15 border-none text-white w-11 h-11 rounded-full cursor-pointer text-2xl flex items-center justify-center">&times;</button>
          </div>
          {/* Image */}
          <div className="flex-1 flex items-center justify-center relative min-h-0 pt-14 px-[70px] max-[960px]:px-4">
            <button onClick={() => setLightboxIdx(i => (i - 1 + galleryUrls.length) % galleryUrls.length)} aria-label="Photo précédente" className="absolute left-4 top-1/2 -translate-y-1/2 bg-white border-none text-[#1a1a2e] w-[52px] h-[52px] rounded-full cursor-pointer text-[26px] font-bold flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.5)] z-10 max-[960px]:w-10 max-[960px]:h-10 max-[960px]:text-xl">&lsaquo;</button>
            <Image src={galleryUrls[lightboxIdx]} alt="" width={1600} height={1200} sizes="100vw" className="max-w-full max-h-full w-auto h-auto object-contain rounded transition-opacity" />
            <button onClick={() => setLightboxIdx(i => (i + 1) % galleryUrls.length)} aria-label="Photo suivante" className="absolute right-4 top-1/2 -translate-y-1/2 bg-white border-none text-[#1a1a2e] w-[52px] h-[52px] rounded-full cursor-pointer text-[26px] font-bold flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.5)] z-10 max-[960px]:w-10 max-[960px]:h-10 max-[960px]:text-xl">&rsaquo;</button>
          </div>
          {/* Thumbnails */}
          <div className="flex gap-2 py-3 px-6 overflow-x-auto justify-center shrink-0">
            {galleryUrls.map((url, i) => (
              <div
                key={url}
                onClick={() => setLightboxIdx(i)}
                className={`relative w-[72px] h-[52px] rounded-[6px] overflow-hidden cursor-pointer shrink-0 border-[3px] transition-all max-[500px]:w-[52px] max-[500px]:h-[38px] ${
                  i === lightboxIdx ? 'border-[var(--orange)] opacity-100' : 'border-transparent opacity-40 hover:opacity-[0.85]'
                }`}
              >
                <Image src={url} alt="" fill sizes="72px" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

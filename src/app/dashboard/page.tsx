'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import { loadArtisanProfile, loadDemandes, loadAvisForArtisan, signOut, saveArtisanProfile } from '@/lib/supabase/helpers'
import { notify } from '@/lib/email/notify'
import type { Artisan, Demande, Avis } from '@/lib/supabase/helpers'
import DashDemandes from '@/components/dashboard/DashDemandes'
import DashAgenda from '@/components/dashboard/DashAgenda'
import DashEquipe from '@/components/dashboard/DashEquipe'
import DashFacturation from '@/components/dashboard/DashFacturation'
import type { DevisPrefill } from '@/lib/facturation'

type TabKey = 'demandes' | 'agenda' | 'equipe' | 'facturation'

const ICON = { className: 'w-6 h-6', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: 'demandes', label: 'Demandes', icon: <svg {...ICON}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg> },
  { key: 'agenda', label: 'Agenda', icon: <svg {...ICON}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg> },
  { key: 'equipe', label: 'Équipe', icon: <svg {...ICON}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg> },
  { key: 'facturation', label: 'Factures', icon: <svg {...ICON}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg> },
]

const isTab = (t: string | null): t is TabKey => TABS.some(x => x.key === t)

export default function DashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('demandes')
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Artisan | null>(null)
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [avis, setAvis] = useState<Avis[]>([])
  const [loading, setLoading] = useState(true)
  // Éditeur de devis / catalogue ouvert : plein écran, sans navigation
  const [immersive, setImmersive] = useState(false)
  const [devisPrefill, setDevisPrefill] = useState<DevisPrefill | null>(null)

  // L'onglet courant vit dans l'URL (?tab=) : un rechargement y revient
  const changeTab = useCallback((key: TabKey) => {
    setTab(key)
    window.history.replaceState(window.history.state, '', `/dashboard?tab=${key}`)
    window.scrollTo(0, 0)
  }, [])

  const createDevisFromDemande = useCallback((d: Demande) => {
    setDevisPrefill({
      client_nom: d.client_nom || '',
      client_email: d.client_email || '',
      client_telephone: d.client_telephone || '',
      client_adresse: d.client_adresse || '',
      description: d.message || '',
    })
    changeTab('facturation')
  }, [changeTab])
  const clearPrefill = useCallback(() => setDevisPrefill(null), [])

  // Filet de sécurité : recharger demandes + avis quand l'onglet redevient actif
  useEffect(() => {
    if (!userId) return
    function onVisible() {
      if (document.visibilityState === 'visible') {
        const supabase = createClient()
        loadDemandes(supabase, userId).then(setDemandes).catch(() => {})
        loadAvisForArtisan(supabase, userId).then(setAvis).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [userId])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/connexion'); return }
      const uid = session.user.id
      setUserId(uid)

      // Finalisation post-confirmation : si un profil est en attente
      // (créé avant validation email), on le sauve maintenant
      try {
        const pending = localStorage.getItem('artisano-pending-profile')
        if (pending) {
          const profileData = JSON.parse(pending)
          await saveArtisanProfile(supabase, uid, profileData)
          localStorage.removeItem('artisano-pending-profile')
          localStorage.setItem('artisano-profil', pending)

          // Persiste aussi la vérification IDE en attente
          const pendingIde = localStorage.getItem('artisano-pending-ide')
          if (pendingIde) {
            try {
              await fetch('/api/verify-ide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ide: pendingIde, mode: 'save' }),
              })
              localStorage.removeItem('artisano-pending-ide')
            } catch { /* ignore */ }
          }

          notify.welcomeArtisan()
        }
      } catch { /* ignore */ }

      try {
        const p = await loadArtisanProfile(supabase, uid)
        if (!p) { router.push('/client'); return }
        setProfile(p)

        const [dem, av] = await Promise.all([
          loadDemandes(supabase, uid),
          loadAvisForArtisan(supabase, uid),
        ])
        setDemandes(dem)
        setAvis(av)
        const t = new URLSearchParams(window.location.search).get('tab')
        if (isTab(t)) setTab(t)
      } catch {
        // If profile load fails, try as client
        router.push('/client')
        return
      }
      setLoading(false)
    })
  }, [router])

  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await signOut(supabase)
    router.push('/connexion')
  }, [router])

  // Stats
  const newDemandes = demandes.filter(d => d.statut === 'nouvelle').length
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const confirmedThisMonth = demandes.filter(d =>
    ['confirmee', 'acceptee', 'terminee'].includes(d.statut) && new Date(d.created_at) >= monthStart
  ).length
  const avgNote = avis.length > 0 ? (avis.reduce((s, a) => s + (a.note || 0), 0) / avis.length).toFixed(1) : '–'
  const responseRate = demandes.length > 0
    ? Math.round(demandes.filter(d => d.statut !== 'nouvelle').length / demandes.length * 100) + '%'
    : '–'

  // Greeting
  const displayName = profile?.entreprise || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim() || ''
  const initials = displayName.split(/[\s&]+/).filter(w => w.length > 0).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  const greeting = profile?.prenom || 'Artisan'

  const now = new Date()
  const jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  const dateStr = `${jours[now.getDay()]} ${now.getDate()} ${mois[now.getMonth()]} ${now.getFullYear()}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--white)]">
        <div className="text-[var(--gray-500)] text-sm">Chargement du tableau de bord...</div>
      </div>
    )
  }

  // Sur mobile, l'accueil (bonjour + chiffres) n'apparaît que sur l'onglet Demandes
  const homeOnly = tab !== 'demandes' ? 'max-[900px]:hidden' : ''

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 px-10 py-3.5 flex items-center justify-between bg-[rgba(250,250,248,0.92)] backdrop-blur-[20px] border-b border-black/5 max-[600px]:px-4 max-[600px]:py-2.5 ${immersive ? 'max-[900px]:hidden' : ''}`}>
        <div className="flex items-center gap-8">
          <Logo />
          <div className="flex items-center gap-1 max-[600px]:hidden">
            <Link href="/dashboard" className="no-underline text-sm font-semibold text-[var(--dark)]">Tableau de bord</Link>
            <span className="text-[var(--gray-300)] mx-1">·</span>
            <Link href="/mon-profil" className="no-underline text-sm text-[var(--gray-500)] hover:text-[var(--dark)] transition-colors">Mon profil</Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--gray-500)] mr-1 max-[600px]:hidden">{displayName}</span>
          <Link href="/mon-profil" aria-label="Mon profil" className="relative w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden no-underline" style={{ background: profile?.avatar_url ? undefined : 'linear-gradient(135deg, var(--dark), var(--dark-mid))' }}>
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill sizes="40px" className="object-cover" />
            ) : initials}
          </Link>
          <button onClick={handleLogout} aria-label="Se déconnecter" title="Se déconnecter" className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--gray-500)] bg-transparent border-none cursor-pointer hover:text-[var(--dark)] hover:bg-[var(--gray-100)] transition-colors">
            <svg aria-hidden="true" className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </nav>

      <div className={`max-w-[1200px] mx-auto px-8 pt-[85px] pb-20 max-[900px]:px-5 max-[600px]:px-4 ${immersive ? 'max-[900px]:pt-0 max-[900px]:pb-0' : 'max-[600px]:pt-[72px] max-[900px]:pb-[calc(88px+env(safe-area-inset-bottom))]'}`}>
        {!immersive && (
          <>
            {/* Header */}
            <div className={`mb-6 max-[600px]:mb-4 ${homeOnly}`}>
              <h1 className="font-sora text-[28px] font-extrabold text-[var(--dark)] mb-1 max-[600px]:text-[22px]">
                Bonjour, <span className="text-[var(--orange)]">{greeting}</span>
              </h1>
              <p className="text-[15px] text-[var(--gray-500)] max-[600px]:text-sm">{dateStr}</p>
            </div>

            {/* Stats */}
            <div className={`grid grid-cols-4 gap-4 mb-8 max-[900px]:grid-cols-2 max-[900px]:gap-3 max-[600px]:mb-5 ${homeOnly}`}>
              {[
                { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label: 'Nouvelles demandes', short: 'Nouvelles', value: newDemandes, sub: 'En attente de réponse' },
                { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>, label: 'Demandes confirmées', short: 'Confirmées', value: confirmedThisMonth, sub: 'Ce mois-ci' },
                { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: 'Note moyenne', short: 'Note', value: avgNote, sub: `${avis.length} avis` },
                { icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>, label: 'Taux de réponse', short: 'Réponse', value: responseRate, sub: 'Demandes traitées' },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] max-[600px]:p-3.5 max-[600px]:rounded-2xl">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--gray-500)] uppercase tracking-wider mb-2 max-[600px]:mb-1 max-[600px]:normal-case max-[600px]:tracking-normal max-[600px]:text-[13px]">
                    <span className="text-[var(--orange)]">{s.icon}</span>
                    <span className="max-[600px]:hidden">{s.label}</span>
                    <span className="hidden max-[600px]:inline">{s.short}</span>
                  </div>
                  <div className="font-sora text-[28px] font-extrabold text-[var(--dark)] max-[600px]:text-[22px] max-[600px]:leading-tight">{s.value}</div>
                  <div className="text-xs text-[var(--gray-500)] mt-0.5 max-[600px]:hidden">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Onglets (ordinateur / tablette large) */}
            <div className="flex gap-1 mb-6 bg-[var(--gray-100)] p-1 rounded-full w-fit max-[900px]:hidden">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => changeTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`py-2.5 px-6 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                    tab === t.key
                      ? 'bg-white text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-[var(--gray-500)] hover:text-[var(--dark)]'
                  }`}
                >
                  {t.key === 'facturation' ? 'Devis & factures' : t.label}
                  {t.key === 'demandes' && newDemandes > 0 && (
                    <span className="ml-1.5 inline-block min-w-5 px-1.5 rounded-full text-[11px] leading-5 text-center bg-[var(--orange)] text-white">
                      {newDemandes}<span className="sr-only"> nouvelle{newDemandes > 1 ? 's' : ''}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Tab Content */}
        {tab === 'demandes' && (
          <DashDemandes
            demandes={demandes}
            setDemandes={setDemandes}
            avis={avis}
            setAvis={setAvis}
            userId={userId}
            onCreateDevis={createDevisFromDemande}
          />
        )}
        {tab === 'agenda' && (
          <DashAgenda userId={userId} profile={profile} />
        )}
        {tab === 'equipe' && (
          <DashEquipe userId={userId} demandes={demandes} />
        )}
        {tab === 'facturation' && (
          <DashFacturation
            userId={userId}
            profile={profile}
            prefill={devisPrefill}
            onPrefillConsumed={clearPrefill}
            onImmersiveChange={setImmersive}
          />
        )}
      </div>

      {/* Barre d'onglets (mobile) */}
      {!immersive && (
        <nav aria-label="Sections du tableau de bord" className="fixed bottom-0 inset-x-0 z-50 bg-[rgba(255,255,255,0.96)] backdrop-blur-[20px] border-t border-[var(--gray-200)] pb-[env(safe-area-inset-bottom)] min-[900px]:hidden">
          <ul className="grid grid-cols-4 max-w-[600px] mx-auto">
            {TABS.map(t => {
              const active = tab === t.key
              return (
                <li key={t.key}>
                  <button
                    onClick={() => changeTab(t.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative w-full h-16 flex flex-col items-center justify-center gap-1 bg-transparent border-none cursor-pointer text-[11px] font-semibold transition-colors ${active ? 'text-[var(--orange)]' : 'text-[var(--gray-500)]'}`}
                  >
                    <span className={`flex items-center justify-center w-14 h-8 rounded-full transition-colors ${active ? 'bg-[rgba(232,112,10,0.12)]' : ''}`}>
                      {t.icon}
                    </span>
                    {t.label}
                    {t.key === 'demandes' && newDemandes > 0 && (
                      <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--orange)] text-white text-[10px] leading-[18px] text-center font-bold ring-2 ring-white">
                        {newDemandes}<span className="sr-only"> nouvelle{newDemandes > 1 ? 's' : ''}</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}

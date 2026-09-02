'use client'

import Image from 'next/image'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import type { Artisan } from '@/lib/supabase/helpers'

function DemandeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const artisanId = searchParams.get('artisan') || searchParams.get('id')
  const jourParam = searchParams.get('jour')
  const dateParam = searchParams.get('date')
  const heureParam = searchParams.get('heure')
  const fulldateParam = searchParams.get('fulldate')
  const hasSlot = !!(jourParam && dateParam && heureParam)

  const [artisan, setArtisan] = useState<Artisan | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOption, setSelectedOption] = useState<number>(hasSlot ? 2 : -1)

  // Quick message fields
  const [qMessage, setQMessage] = useState('')
  const [qPrenom, setQPrenom] = useState('')
  const [qTel, setQTel] = useState('')
  const [qEmail, setQEmail] = useState('')

  // Full form fields
  const [fPrenom, setFPrenom] = useState('')
  const [fNom, setFNom] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fTel, setFTel] = useState('')
  const [fAdresse, setFAdresse] = useState('')
  const [fMessage, setFMessage] = useState('')
  const [fDate, setFDate] = useState(hasSlot ? `${jourParam} ${dateParam}` : '')
  const [fMoment, setFMoment] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [authEmail, setAuthEmail] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!artisanId) { setLoading(false); return }
    const supabase = createClient()

    // Force la connexion : la RLS bloque les INSERT anonymes silencieusement,
    // donc on redirige vers /connexion avec retour ici après login
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        const back = `/demande?artisan=${encodeURIComponent(artisanId)}`
        router.replace(`/connexion?next=${encodeURIComponent(back)}`)
        return
      }
      if (user.email) {
        setAuthEmail(user.email)
        setQEmail(user.email)
        setFEmail(user.email)
      }
    })

    // Vue publique (sans bank_*) suffit pour afficher la card artisan
    supabase.from('artisans_public').select('*').eq('id', artisanId).maybeSingle().then(({ data }) => {
      if (data) setArtisan(data as Artisan)
      setLoading(false)
    })
  }, [artisanId, router])

  const artisanName = artisan ? (artisan.entreprise || `${artisan.prenom} ${artisan.nom}`.trim() || 'Artisan') : ''
  const prefs = artisan?.contact_prefs || { complete: true, message: false, appel: false }

  const options = [
    { key: 'appel', show: prefs.appel, icon: <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>, title: 'Appeler directement', desc: "Parlez avec l'artisan tout de suite par téléphone", iconBg: 'bg-[var(--green-light)]', iconColor: 'text-[var(--green)]' },
    { key: 'message', show: prefs.message, icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>, title: 'Message rapide', desc: "Décrivez votre problème en quelques mots, on vous rappelle", iconBg: 'bg-[var(--blue-light)]', iconColor: 'text-[var(--blue)]' },
    { key: 'complete', show: true, icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>, title: 'Demande complète', desc: 'Rendez-vous avec tous les détails et photos', iconBg: 'bg-[rgba(232,112,10,0.08)]', iconColor: 'text-[var(--orange)]' },
  ]
  const visibleOptions = options.filter(o => o.show)

  async function sendQuickMessage() {
    const errs: Record<string, string> = {}
    if (!qMessage.trim()) errs.qMessage = 'Décrivez votre problème'
    if (!qPrenom.trim()) errs.qPrenom = 'Prénom requis'
    if (!qTel.trim()) errs.qTel = 'Téléphone requis'
    if (qEmail.trim() && !qEmail.includes('@')) errs.qEmail = 'Email invalide'
    setErrors(errs)
    if (Object.keys(errs).length > 0 || !artisanId) return

    setSending(true)
    // Passe par /api/demandes : validation Zod + rate limit côté serveur,
    // et notification email de l'artisan déclenchée par le serveur.
    // L'email du compte est forcé (RLS exige client_email = auth.email()).
    const res = await fetch('/api/demandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artisan_id: artisanId, client_nom: qPrenom.trim(), client_email: authEmail || qEmail.trim() || null,
        client_telephone: qTel.trim(), type: 'message', message: qMessage.trim(),
      }),
    }).catch(() => null)
    setSending(false)
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {}
      alert(body.error || "Erreur lors de l'envoi. Veuillez réessayer.")
      return
    }
    setSent(true)
  }

  async function sendFullRequest() {
    const errs: Record<string, string> = {}
    if (!fPrenom.trim()) errs.fPrenom = 'Prénom requis'
    if (!fNom.trim()) errs.fNom = 'Nom requis'
    if (!fEmail.trim()) errs.fEmail = 'Email requis'
    else if (!fEmail.includes('@')) errs.fEmail = 'Email invalide'
    if (!fTel.trim()) errs.fTel = 'Téléphone requis'
    if (!fMessage.trim()) errs.fMessage = 'Décrivez votre besoin'
    setErrors(errs)
    if (Object.keys(errs).length > 0 || !artisanId) return

    setSending(true)
    // Passe par /api/demandes (validation + rate limit + email serveur).
    const res = await fetch('/api/demandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artisan_id: artisanId, client_nom: `${fPrenom.trim()} ${fNom.trim()}`, client_email: authEmail || fEmail.trim(),
        client_telephone: fTel.trim(), client_adresse: fAdresse.trim() || null, type: 'devis',
        message: fMessage.trim(), date_souhaitee: fDate.trim() || null, moment_journee: fMoment || null,
        creneau_date: fulldateParam || null, creneau_heure: heureParam || null,
      }),
    }).catch(() => null)
    setSending(false)
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {}
      alert(body.error || "Erreur lors de l'envoi. Veuillez réessayer.")
      return
    }
    setSent(true)
  }

  const inputClass = (field?: string) =>
    `w-full py-3 px-3.5 border-2 rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[600px]:text-base max-[600px]:min-h-11 ${
      field && errors[field] ? 'border-[var(--red)]' : 'border-[var(--gray-200)]'
    }`

  const fieldError = (field: string) =>
    errors[field] ? <div className="text-[var(--red)] text-xs font-semibold mt-1">{errors[field]}</div> : null

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--gray-500)]">Chargement...</div>
  if (!artisanId || !artisan) return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <h2 className="font-sora text-xl font-bold mb-3">Artisan introuvable</h2>
        <p className="text-[var(--gray-500)] mb-6">Ce lien ne contient pas d&apos;identifiant artisan valide.</p>
        <Link href="/recherche" className="text-[var(--orange)] font-semibold">Rechercher un artisan</Link>
      </div>
    </div>
  )

  if (sent) return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="bg-white rounded-2xl p-12 border border-[var(--gray-200)] max-w-md">
        <div className="w-16 h-16 bg-[var(--green-light)] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[var(--green)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h2 className="font-sora text-2xl font-bold mb-3">Envoyé avec succès !</h2>
        <p className="text-[var(--gray-500)] mb-6">Votre demande a été envoyée à {artisanName}. Vous recevrez une réponse rapidement.</p>
        <Link href={`/artisan/${artisanId}`} className="text-[var(--orange)] font-semibold hover:underline">Retour au profil</Link>
      </div>
    </div>
  )

  // Build horaires string
  let hoursText = ''
  if (artisan.horaires && Array.isArray(artisan.horaires)) {
    const parts = (artisan.horaires as Array<{ jour?: string; ouvert?: boolean; debut?: string; fin?: string }>)
      .filter(h => h.ouvert)
      .map(h => `${h.jour} ${h.debut}–${h.fin}`)
    hoursText = parts.join(' · ')
  }

  return (
    <div className="max-w-[900px] mx-auto px-10 pt-[100px] pb-20 max-[900px]:px-4 max-[900px]:pt-[90px] max-[600px]:px-3 max-[600px]:pt-20 max-[600px]:pb-[60px]">
      {/* Artisan header */}
      <div className="flex gap-5 items-center bg-white rounded-[var(--radius)] p-6 border border-[var(--gray-200)] mb-7 max-[600px]:flex-col max-[600px]:text-center max-[600px]:p-5 max-[600px]:gap-3.5">
        <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden max-[600px]:w-[52px] max-[600px]:h-[52px] max-[600px]:rounded-[14px]" style={{ background: artisan.avatar_url ? undefined : 'linear-gradient(135deg, var(--dark), var(--dark-mid))' }}>
          {artisan.avatar_url ? (
            <Image src={artisan.avatar_url} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <svg className="w-7 h-7 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
          )}
        </div>
        <div className="flex-1">
          <div className="font-sora font-extrabold text-xl max-[600px]:text-lg">{artisanName}</div>
          {artisan.metier && <div className="text-[13px] text-[var(--orange)] font-bold uppercase tracking-wider">{artisan.metier}</div>}
          {artisan.zones && artisan.zones.length > 0 && (
            <div className="flex gap-4 mt-1.5 text-[13px] text-[var(--gray-500)] max-[600px]:justify-center max-[600px]:flex-wrap">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {artisan.zones[0]} et environs
              </span>
            </div>
          )}
        </div>
      </div>

      <h1 className="font-sora text-2xl font-extrabold mb-2 max-[600px]:text-xl">Comment souhaitez-vous nous contacter ?</h1>
      <p className="text-[15px] text-[var(--gray-500)] mb-7 leading-relaxed max-[600px]:text-sm max-[600px]:mb-5">Choisissez la méthode qui vous convient le mieux.</p>

      {/* Options grid */}
      <div className={`grid gap-4 mb-8 max-[600px]:grid-cols-1 max-[600px]:gap-3 max-[600px]:mb-6`} style={{ gridTemplateColumns: `repeat(${visibleOptions.length}, 1fr)` }}>
        {visibleOptions.map((opt, i) => {
          const realIdx = options.indexOf(opt)
          return (
            <button key={opt.key} type="button" onClick={() => setSelectedOption(realIdx)}
              className={`bg-white border-2 rounded-[var(--radius)] p-7 text-center cursor-pointer transition-all relative max-[600px]:p-5 hover:-translate-y-[3px] hover:shadow-[0_8px_28px_rgba(0,0,0,0.06)] ${
                selectedOption === realIdx ? 'border-[var(--orange)] shadow-[0_0_0_3px_rgba(232,112,10,0.1)]' : 'border-[var(--gray-200)] hover:border-[var(--gray-300)]'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3.5 transition-transform ${opt.iconBg} ${selectedOption === realIdx ? 'scale-110' : ''} max-[600px]:w-12 max-[600px]:h-12 max-[600px]:rounded-[14px] max-[600px]:mb-2.5`}>
                <svg className={`w-[26px] h-[26px] ${opt.iconColor} max-[600px]:w-[22px] max-[600px]:h-[22px]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{opt.icon}</svg>
              </div>
              <div className="font-sora text-base font-bold mb-1.5 max-[600px]:text-[15px]">{opt.title}</div>
              <div className="text-[13px] text-[var(--gray-500)] leading-snug max-[600px]:text-xs">{opt.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Panel 0: Appel */}
      {selectedOption === 0 && (
        <div className="animate-[fadeIn_0.4s_ease-out]">
          <div className="bg-white rounded-[var(--radius)] p-8 border border-[var(--gray-200)] max-[600px]:p-6">
            <div className="text-center py-5">
              <div className="font-sora text-[32px] font-extrabold mb-2 max-[600px]:text-2xl">{artisan.telephone || '—'}</div>
              <div className="text-sm text-[var(--gray-500)] mb-6 max-[600px]:text-[13px]">{hoursText || 'Horaires non disponibles'}</div>
              <a href={artisan.telephone ? `tel:+41${artisan.telephone.replace(/\s/g, '')}` : '#'} className="inline-flex items-center gap-2.5 bg-[var(--green)] text-white py-4 px-10 rounded-full font-sora font-bold text-base no-underline transition-all hover:bg-[#257a2e] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(46,125,50,0.3)] max-[600px]:w-full max-[600px]:justify-center max-[600px]:py-3.5 max-[600px]:px-6 max-[600px]:text-[15px] max-[600px]:min-h-11">
                <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                Appeler maintenant
              </a>
              <div className="mt-5 text-[13px] text-[var(--gray-500)] leading-snug max-w-[400px] mx-auto max-[600px]:text-xs">
                En mentionnant que vous appelez via Artisano, l&apos;artisan pourra retrouver votre demande.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel 1: Message rapide */}
      {selectedOption === 1 && (
        <div className="animate-[fadeIn_0.4s_ease-out]">
          <div className="bg-white rounded-[var(--radius)] p-8 border border-[var(--gray-200)] max-[600px]:p-6">
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Quel est le problème ?</label>
              <textarea value={qMessage} onChange={e => { setQMessage(e.target.value); setErrors(p => { const { qMessage: _, ...r } = p; return r }) }} placeholder="Par exemple : fuite sous l'évier, chauffe-eau en panne..." className={`${inputClass('qMessage')} resize-y min-h-20`} rows={3} />
              {fieldError("qMessage")}
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-4 max-[600px]:grid-cols-1 max-[600px]:gap-3">
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Votre prénom</label>
                <input type="text" placeholder="Jean" value={qPrenom} onChange={e => { setQPrenom(e.target.value); setErrors(p => { const { qPrenom: _, ...r } = p; return r }) }} className={inputClass('qPrenom')} />
                {fieldError("qPrenom")}
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Votre téléphone</label>
                <input type="tel" placeholder="079 123 45 67" value={qTel} onChange={e => { setQTel(e.target.value); setErrors(p => { const { qTel: _, ...r } = p; return r }) }} className={inputClass('qTel')} />
                {fieldError("qTel")}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Votre email</label>
              <input type="email" placeholder="jean.dupont@email.ch" value={qEmail} onChange={e => { setQEmail(e.target.value); setErrors(p => { const { qEmail: _, ...r } = p; return r }) }} readOnly={!!authEmail} className={inputClass('qEmail') + (authEmail ? ' bg-[var(--gray-100)] cursor-not-allowed' : '')} />
              {authEmail && <div className="text-[11px] text-[var(--gray-500)] mt-1">Email de votre compte (non modifiable)</div>}
              <div className="text-xs text-[var(--gray-500)] mt-1">Pour recevoir la confirmation</div>
              {fieldError("qEmail")}
            </div>
            <button onClick={sendQuickMessage} disabled={sending} className="w-full bg-[var(--orange)] text-white py-3.5 rounded-full font-sora font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] disabled:opacity-60 max-[600px]:min-h-11 max-[600px]:text-sm mt-2">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              {sending ? 'Envoi...' : "Envoyer — l'artisan vous rappelle"}
            </button>
            <div className="text-center mt-4">
              <button onClick={() => setSelectedOption(2)} className="text-[13px] text-[var(--orange)] font-semibold underline underline-offset-2 hover:text-[var(--orange-dark)]">
                Ajouter plus de détails (adresse, photos, créneau souhaité)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel 2: Formulaire complet */}
      {selectedOption === 2 && (
        <div className="animate-[fadeIn_0.4s_ease-out]">
          <div className="bg-white rounded-[var(--radius)] p-8 border border-[var(--gray-200)] max-[600px]:p-6">
            {/* Slot banner */}
            {hasSlot && (
              <div className="flex items-center gap-3 p-4 rounded-[10px] mb-6" style={{ background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' }}>
                <svg className="w-5 h-5 text-[var(--green)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <div>
                  <div className="font-sora font-bold text-sm text-[var(--green)]">Créneau sélectionné</div>
                  <div className="text-[13px] text-[#1B5E20]">{jourParam} {dateParam} à {heureParam}</div>
                </div>
              </div>
            )}

            {/* Coordonnées */}
            <hr className="border-t border-[var(--gray-200)] my-6" />
            <div className="font-sora text-[15px] font-bold mb-3.5 flex items-center gap-2 max-[600px]:text-sm">
              <svg className="w-[18px] h-[18px] text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Vos coordonnées
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-4 max-[600px]:grid-cols-1 max-[600px]:gap-3">
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Prénom</label>
                <input type="text" placeholder="Jean" value={fPrenom} onChange={e => { setFPrenom(e.target.value); setErrors(p => { const { fPrenom: _, ...r } = p; return r }) }} className={inputClass('fPrenom')} />
                {fieldError("fPrenom")}
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Nom</label>
                <input type="text" placeholder="Dupont" value={fNom} onChange={e => { setFNom(e.target.value); setErrors(p => { const { fNom: _, ...r } = p; return r }) }} className={inputClass('fNom')} />
                {fieldError("fNom")}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-4 max-[600px]:grid-cols-1 max-[600px]:gap-3">
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Email</label>
                <input type="email" placeholder="jean.dupont@email.ch" value={fEmail} onChange={e => { setFEmail(e.target.value); setErrors(p => { const { fEmail: _, ...r } = p; return r }) }} readOnly={!!authEmail} className={inputClass('fEmail') + (authEmail ? ' bg-[var(--gray-100)] cursor-not-allowed' : '')} />
                {authEmail && <div className="text-[11px] text-[var(--gray-500)] mt-1">Email de votre compte (non modifiable)</div>}
                {fieldError("fEmail")}
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Téléphone</label>
                <input type="tel" placeholder="079 123 45 67" value={fTel} onChange={e => { setFTel(e.target.value); setErrors(p => { const { fTel: _, ...r } = p; return r }) }} className={inputClass('fTel')} />
                {fieldError("fTel")}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Adresse de l&apos;intervention</label>
              <input type="text" placeholder="Rue du Lac 15, 1003 Lausanne" value={fAdresse} onChange={e => setFAdresse(e.target.value)} className={inputClass()} />
            </div>

            {/* Problème */}
            <hr className="border-t border-[var(--gray-200)] my-6" />
            <div className="font-sora text-[15px] font-bold mb-3.5 flex items-center gap-2 max-[600px]:text-sm">
              <svg className="w-[18px] h-[18px] text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
              Votre besoin
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Description</label>
              <textarea placeholder="Décrivez la situation en quelques mots : fuite sous l'évier, chauffe-eau qui ne chauffe plus..." value={fMessage} onChange={e => { setFMessage(e.target.value); setErrors(p => { const { fMessage: _, ...r } = p; return r }) }} className={`${inputClass('fMessage')} resize-y min-h-20`} />
              {fieldError("fMessage")}
            </div>

            {/* Créneau */}
            <hr className="border-t border-[var(--gray-200)] my-6" />
            <div className="font-sora text-[15px] font-bold mb-3.5 flex items-center gap-2 max-[600px]:text-sm">
              <svg className="w-[18px] h-[18px] text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Créneau souhaité <span className="text-[var(--gray-500)] font-normal text-[13px]">(facultatif)</span>
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-4 max-[600px]:grid-cols-1 max-[600px]:gap-3">
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Date souhaitée</label>
                <input type="text" placeholder="Par exemple : lundi 17 mars" value={fDate} onChange={e => setFDate(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Moment de la journée</label>
                <select value={fMoment} onChange={e => setFMoment(e.target.value)} className={`${inputClass()} appearance-none bg-no-repeat bg-[right_14px_center] pr-10`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238A8680' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")` }}>
                  <option value="">Pas de préférence</option>
                  <option>Matin (8h00 - 12h00)</option>
                  <option>Début d&apos;après-midi (12h00 - 15h00)</option>
                  <option>Fin d&apos;après-midi (15h00 - 18h00)</option>
                </select>
              </div>
            </div>

            <button onClick={sendFullRequest} disabled={sending} className="w-full bg-[var(--orange)] text-white py-3.5 rounded-full font-sora font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] disabled:opacity-60 max-[600px]:min-h-11 max-[600px]:text-sm mt-2">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              {sending ? 'Envoi...' : 'Envoyer ma demande'}
            </button>

            <div className="bg-[var(--blue-light)] rounded-[var(--radius-sm)] p-3.5 flex gap-2.5 items-start mt-4 max-[600px]:p-3">
              <svg className="w-4 h-4 text-[var(--blue)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <p className="text-xs text-[var(--blue)] leading-snug max-[600px]:text-[11px]">Aucun compte nécessaire. Vos données sont envoyées uniquement à cet artisan.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DemandePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="fixed top-0 left-0 right-0 z-50 px-10 py-5 flex items-center justify-between bg-[rgba(250,250,248,0.9)] backdrop-blur-[20px] border-b border-black/5 max-[900px]:px-4 max-[900px]:py-3.5 max-[600px]:px-4 max-[600px]:py-3">
        <Logo />
        <Link href="/recherche" className="text-[var(--gray-700)] text-sm font-medium flex items-center gap-1.5 hover:text-[var(--dark)] transition-colors max-[900px]:hidden">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Retour
        </Link>
      </nav>
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[var(--gray-500)]">Chargement...</div>}>
        <DemandeContent />
      </Suspense>
    </div>
  )
}

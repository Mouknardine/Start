'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { loadMyBankDetails } from '@/lib/supabase/helpers'
import type { Artisan, Avis } from '@/lib/supabase/helpers'
import { loadAgendaKey } from '@/lib/supabase/agenda'
import { CLE_REGLAGES, normaliserReglages, formatPrixCourt, REGLAGES_DEFAUT, type ReglagesFacturation } from '@/lib/facturation'
import ReglagesSheet from './facturation/ReglagesSheet'
import { Ico, IconChevron, IconCheck, IconSettings, IconBook, IconEye } from './facturation/ui'

type Props = {
  userId: string
  profile: Artisan
  avis: Avis[]
  /** Ouvre un autre onglet du tableau de bord (ex. Agenda pour les disponibilités) */
  onOpenTab: (tab: 'agenda' | 'facturation') => void
  onLogout: () => void
}

type Etape = { key: string; label: string; ok: boolean; href?: string; action?: () => void }

/**
 * Onglet « Profil » : tout ce qui concerne l'artisan au même endroit —
 * sa page publique, ce qu'il manque pour qu'elle attire des clients, et
 * des raccourcis directs vers chaque section de « Mon profil ».
 */
export default function DashProfil({ userId, profile, avis, onOpenTab, onLogout }: Props) {
  const [reglages, setReglages] = useState<ReglagesFacturation>(REGLAGES_DEFAUT)
  const [hasIban, setHasIban] = useState<boolean | null>(null)
  const [showReglages, setShowReglages] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    loadAgendaKey<unknown>(supabase, userId, CLE_REGLAGES, null).then(r => setReglages(normaliserReglages(r))).catch(() => {})
    loadMyBankDetails(supabase).then(b => setHasIban(!!b?.bank_iban)).catch(() => setHasIban(false))
  }, [userId])

  const nom = profile.entreprise || `${profile.prenom || ''} ${profile.nom || ''}`.trim() || 'Mon entreprise'
  const initiales = nom.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
  const note = avis.length ? (avis.reduce((s, a) => s + (a.note || 0), 0) / avis.length).toFixed(1) : null
  const publicUrl = `/artisan/${userId}`
  const slots = (profile.disponibilites as { slots?: Record<string, unknown> } | null)?.slots
  const horairesOk = Array.isArray(profile.horaires) && profile.horaires.some(h => (h as { ouvert?: boolean }).ouvert)

  const etapes: Etape[] = [
    { key: 'photo', label: 'Ajouter une photo ou un logo', ok: !!profile.avatar_url, href: '/mon-profil#photo' },
    { key: 'description', label: 'Décrire votre activité (quelques phrases)', ok: (profile.description || '').trim().length >= 80, href: '/mon-profil#activite' },
    { key: 'zones', label: 'Indiquer vos communes d’intervention', ok: (profile.zones || []).length > 0, href: '/mon-profil#activite' },
    { key: 'specialites', label: 'Lister vos spécialités', ok: (profile.specialites || []).length > 0, href: '/mon-profil#activite' },
    { key: 'galerie', label: 'Montrer vos réalisations en photos', ok: (profile.gallery_urls || []).length > 0, href: '/mon-profil#galerie' },
    { key: 'horaires', label: 'Renseigner vos horaires', ok: horairesOk, href: '/mon-profil#horaires' },
    { key: 'dispos', label: 'Publier vos disponibilités', ok: !!slots && Object.keys(slots).length > 0, action: () => onOpenTab('agenda') },
    { key: 'ide', label: 'Faire vérifier votre entreprise (IDE)', ok: !!profile.ide_verified, href: '/mon-profil#verification' },
    { key: 'tarif', label: 'Indiquer votre tarif horaire', ok: reglages.tarif_horaire > 0, action: () => setShowReglages(true) },
    { key: 'iban', label: 'Ajouter votre IBAN (QR-facture)', ok: hasIban !== false, href: '/mon-profil#banque' },
  ]
  const faits = etapes.filter(e => e.ok).length
  const pct = Math.round((faits / etapes.length) * 100)
  const manquantes = etapes.filter(e => !e.ok)

  async function partager() {
    const url = window.location.origin + publicUrl
    try {
      if (navigator.share) {
        await navigator.share({ title: nom, text: `${nom}${profile.metier ? ` — ${profile.metier}` : ''} sur Artisano`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* partage annulé */ }
  }

  return (
    <div className="flex flex-col gap-4 max-w-[720px]">
      <h2 className="font-sora text-[22px] font-extrabold text-[var(--dark)]">Mon profil</h2>

      {/* Carte d'identité */}
      <section className="rounded-[20px] p-5 bg-[var(--dark)] text-white" aria-label="Votre page publique">
        <div className="flex items-center gap-4">
          <span className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center bg-white/10 font-sora font-extrabold text-xl">
            {profile.avatar_url ? <Image src={profile.avatar_url} alt="" fill sizes="64px" className="object-cover" /> : initiales}
          </span>
          <div className="min-w-0">
            <div className="font-sora font-extrabold text-[19px] leading-tight truncate">{nom}</div>
            <div className="text-[14px] text-white/70 truncate">{[profile.metier, (profile.zones || [])[0]].filter(Boolean).join(' · ') || 'Métier à renseigner'}</div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {profile.ide_verified && (
                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-[var(--green)] text-white text-[12px] font-bold">
                  <IconCheck className="w-3.5 h-3.5" /> Entreprise vérifiée
                </span>
              )}
              {note && <span className="text-[13px] text-white/80">★ {note} · {avis.length} avis</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Link href={publicUrl} className="inline-flex items-center justify-center gap-2 h-12 rounded-full bg-white text-[var(--dark)] text-[15px] font-bold no-underline">
            <IconEye /> Voir ma page
          </Link>
          <button type="button" onClick={partager} className="inline-flex items-center justify-center gap-2 h-12 rounded-full bg-white/12 text-white text-[15px] font-semibold border-none cursor-pointer">
            <Ico><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></Ico>
            {copied ? 'Lien copié' : 'Partager'}
          </button>
        </div>
      </section>

      {/* Avancement */}
      <section className="rounded-[20px] p-5 bg-white border border-[var(--gray-200)]" aria-labelledby="profil-avancement">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="profil-avancement" className="font-sora font-bold text-[16px]">{pct === 100 ? 'Profil complet' : 'Complétez votre profil'}</h3>
          <span className="font-sora font-extrabold text-[18px] text-[var(--orange)]">{pct} %</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--gray-100)] mt-2 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du profil">
          <div className="h-full rounded-full bg-[var(--orange)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[14px] text-[var(--gray-500)] mt-2">
          {pct === 100 ? 'Bravo, votre page donne toutes les informations aux clients.' : 'Un profil complet reçoit nettement plus de demandes.'}
        </p>
        {manquantes.length > 0 && (
          <ul className="mt-3 flex flex-col">
            {manquantes.slice(0, 4).map(e => (
              <Row key={e.key} label={e.label} href={e.href} onClick={e.action} flat
                icon={<span aria-hidden="true" className="w-6 h-6 rounded-full border-2 border-[var(--gray-300)] shrink-0" />} />
            ))}
            {manquantes.length > 4 && <li className="text-[13px] text-[var(--gray-500)] pt-2 pl-9">et {manquantes.length - 4} autre{manquantes.length - 4 > 1 ? 's' : ''}</li>}
          </ul>
        )}
      </section>

      <Group titre="Ma page publique">
        <Row label="Photo et réalisations" href="/mon-profil#photo" />
        <Row label="Entreprise et coordonnées" href="/mon-profil#entreprise" />
        <Row label="Métier, zones et description" href="/mon-profil#activite" />
        <Row label="Horaires et urgences" href="/mon-profil#horaires" />
        <Row label="Disponibilités de la semaine" onClick={() => onOpenTab('agenda')} />
        <Row label="Préférences de contact" href="/mon-profil#contact" />
      </Group>

      <Group titre="Devis et factures">
        <Row label="Tarifs, TVA et délais" detail={reglages.tarif_horaire ? `${formatPrixCourt(reglages.tarif_horaire)}/h` : 'À renseigner'} onClick={() => setShowReglages(true)} icon={<IconSettings className="w-5 h-5 text-[var(--gray-500)]" />} />
        <Row label="Coordonnées bancaires" detail={hasIban === null ? '' : hasIban ? 'IBAN renseigné' : 'À renseigner'} href="/mon-profil#banque" />
        <Row label="Catalogue de prestations" onClick={() => onOpenTab('facturation')} icon={<IconBook className="w-5 h-5 text-[var(--gray-500)]" />} />
      </Group>

      <Group titre="Compte">
        <Row label="Vérification de l’entreprise (IDE)" detail={profile.ide_verified ? 'Vérifiée' : ''} href="/mon-profil#verification" />
        <Row label="Mes données et suppression du compte" href="/mon-profil#donnees" />
        <li>
          <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 min-h-14 px-4 text-left text-[15px] font-semibold text-[var(--red)] bg-transparent border-none cursor-pointer hover:bg-[var(--red-light)]">
            <Ico className="w-5 h-5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Ico>
            Se déconnecter
          </button>
        </li>
      </Group>

      {showReglages && (
        <ReglagesSheet userId={userId} reglages={reglages} onClose={() => setShowReglages(false)}
          onSaved={r => { setReglages(r); setShowReglages(false) }} />
      )}
    </div>
  )
}

function Group({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section aria-label={titre}>
      <h3 className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)] mb-2 px-1">{titre}</h3>
      <ul className="rounded-[20px] bg-white border border-[var(--gray-200)] overflow-hidden divide-y divide-[var(--gray-100)]">{children}</ul>
    </section>
  )
}

function Row({ label, detail, href, onClick, icon, flat = false }: { label: string; detail?: string; href?: string; onClick?: () => void; icon?: ReactNode; flat?: boolean }) {
  const inner = (
    <>
      {icon}
      <span className="flex-1 min-w-0 text-[15px] font-semibold text-[var(--dark)]">{label}</span>
      {detail && <span className="text-[13px] text-[var(--gray-500)] shrink-0">{detail}</span>}
      <IconChevron className="w-5 h-5 text-[var(--gray-300)] shrink-0" />
    </>
  )
  const cls = `w-full flex items-center gap-3 min-h-14 py-2 text-left no-underline bg-transparent border-none cursor-pointer hover:bg-[var(--gray-50)] ${flat ? 'px-0 rounded-xl' : 'px-4'}`
  return (
    <li>
      {href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>}
    </li>
  )
}

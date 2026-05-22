'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/helpers'
import type { Artisan, Demande, Avis } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'
import { logAuditAction, type AuditLog } from '@/lib/audit'

type TabKey = 'dashboard' | 'artisans' | 'demandes' | 'avis' | 'signalements' | 'audit'

type Signalement = {
  id: string
  cible_type: 'avis' | 'artisan' | 'demande'
  cible_id: string
  raison: string
  details: string | null
  reporter_email: string | null
  statut: 'nouveau' | 'examine' | 'rejete' | 'accepte'
  notes_admin: string | null
  created_at: string
}

const NAV_ITEMS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'dashboard', label: 'Tableau de bord',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  },
  {
    key: 'artisans', label: 'Artisans',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    key: 'demandes', label: 'Demandes',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  },
  {
    key: 'avis', label: 'Avis',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  },
  {
    key: 'signalements', label: 'Signalements',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  },
  {
    key: 'audit', label: 'Journal',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
]

type DemandeWithArtisan = Demande & { artisans?: { entreprise: string; prenom: string; nom: string } | null }
type AvisWithArtisan = Avis & { artisans?: { entreprise: string; prenom: string; nom: string } | null }

function artisanName(a: Partial<Artisan> | { entreprise?: string; prenom?: string; nom?: string } | null | undefined) {
  if (!a) return '-'
  return a.entreprise || `${a.prenom || ''} ${a.nom || ''}`.trim() || '-'
}

function artisanInitials(a: Partial<Artisan> | null | undefined) {
  const n = artisanName(a)
  return n.split(/[\s&]+/).filter(w => w.length > 0).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminClient() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [loading, setLoading] = useState(true)

  const [allArtisans, setAllArtisans] = useState<Artisan[]>([])
  const [allDemandes, setAllDemandes] = useState<DemandeWithArtisan[]>([])
  const [allAvis, setAllAvis] = useState<AvisWithArtisan[]>([])
  const [allSignalements, setAllSignalements] = useState<Signalement[]>([])
  const [allAudit, setAllAudit] = useState<AuditLog[]>([])

  const [searchArtisans, setSearchArtisans] = useState('')
  const [searchDemandes, setSearchDemandes] = useState('')
  const [searchAvis, setSearchAvis] = useState('')
  const [statutFilter, setStatutFilter] = useState<'tous' | Signalement['statut']>('nouveau')

  // Le check admin est désormais fait côté serveur dans page.tsx — ici
  // on se contente de charger les données. RLS bloquera quand même les
  // non-admins en lecture sur les colonnes/lignes sensibles.
  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      try {
        const [artRes, demRes, avisRes, sigRes, auditRes] = await Promise.all([
          // Vue publique (sans bank_*). Admin peut lire l'IBAN d'un artisan
          // précis via la fonction RPC get_artisan_bank_details_admin si besoin.
          supabase.from('artisans_public').select('*').order('created_at', { ascending: false }),
          supabase.from('demandes').select('*, artisans(entreprise, prenom, nom)').order('created_at', { ascending: false }),
          supabase.from('avis').select('*, artisans(entreprise, prenom, nom)').order('created_at', { ascending: false }),
          supabase.from('signalements').select('*').order('created_at', { ascending: false }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500),
        ])
        setAllArtisans((artRes.data || []) as Artisan[])
        setAllDemandes((demRes.data || []) as DemandeWithArtisan[])
        setAllAvis((avisRes.data || []) as AvisWithArtisan[])
        setAllSignalements((sigRes.data || []) as Signalement[])
        setAllAudit((auditRes.data || []) as AuditLog[])
      } catch (e) {
        logger.error('Admin load error:', e)
      }
      setLoading(false)
    })()
  }, [router])

  // Filtered data
  const filteredArtisans = useMemo(() => {
    if (!searchArtisans) return allArtisans
    const q = searchArtisans.toLowerCase()
    return allArtisans.filter(a =>
      `${artisanName(a)} ${a.metier || ''} ${a.email || ''} ${(a.zones || []).join(' ')}`.toLowerCase().includes(q)
    )
  }, [allArtisans, searchArtisans])

  const filteredDemandes = useMemo(() => {
    if (!searchDemandes) return allDemandes
    const q = searchDemandes.toLowerCase()
    return allDemandes.filter(d => {
      const aName = d.artisans ? artisanName(d.artisans) : ''
      return `${d.client_nom || ''} ${d.client_email || ''} ${aName} ${d.statut || ''}`.toLowerCase().includes(q)
    })
  }, [allDemandes, searchDemandes])

  const filteredAvis = useMemo(() => {
    if (!searchAvis) return allAvis
    const q = searchAvis.toLowerCase()
    return allAvis.filter(a => {
      const aName = a.artisans ? artisanName(a.artisans) : ''
      return `${a.client_nom || ''} ${a.client_email || ''} ${aName} ${a.commentaire || ''}`.toLowerCase().includes(q)
    })
  }, [allAvis, searchAvis])

  // Stats
  const stats = useMemo(() => ({
    artisans: allArtisans.length,
    demandes: allDemandes.length,
    avis: allAvis.length,
    demandesNew: allDemandes.filter(d => d.statut === 'nouvelle').length,
    signalementsNouveaux: allSignalements.filter(s => s.statut === 'nouveau').length,
    auditCount: allAudit.length,
  }), [allArtisans, allDemandes, allAvis, allSignalements, allAudit])

  // Delete demande
  async function handleDeleteDemande(id: string) {
    if (!confirm('Supprimer cette demande ? Cette action est irreversible.')) return
    try {
      const supabase = createClient()
      await supabase.from('demandes').delete().eq('id', id)
      setAllDemandes(prev => prev.filter(d => d.id !== id))
      await logAuditAction(supabase, { action: 'delete_demande', targetType: 'demande', targetId: id })
    } catch (e) {
      alert('Erreur: ' + (e as Error).message)
    }
  }

  // Delete avis
  async function handleDeleteAvis(id: string) {
    if (!confirm('Supprimer cet avis ? Cette action est irreversible.')) return
    try {
      const supabase = createClient()
      await supabase.from('avis').delete().eq('id', id)
      setAllAvis(prev => prev.filter(a => a.id !== id))
      await logAuditAction(supabase, { action: 'delete_avis', targetType: 'avis', targetId: id })
    } catch (e) {
      alert('Erreur: ' + (e as Error).message)
    }
  }

  // Mise à jour statut signalement
  async function updateSignalementStatut(id: string, statut: Signalement['statut']) {
    try {
      const supabase = createClient()
      await supabase.from('signalements').update({ statut, updated_at: new Date().toISOString() }).eq('id', id)
      setAllSignalements(prev => prev.map(s => s.id === id ? { ...s, statut } : s))
      await logAuditAction(supabase, { action: `signalement_${statut}`, targetType: 'signalement', targetId: id })
    } catch (e) {
      alert('Erreur: ' + (e as Error).message)
    }
  }

  // Suppression de la cible signalée + signalement
  async function handleResolveSignalement(s: Signalement) {
    if (!confirm(`Supprimer ${s.cible_type === 'avis' ? "l'avis" : 's profil'} signalé et marquer accepté ?`)) return
    try {
      const supabase = createClient()
      if (s.cible_type === 'avis') {
        await supabase.from('avis').delete().eq('id', s.cible_id)
        setAllAvis(prev => prev.filter(a => a.id !== s.cible_id))
        await logAuditAction(supabase, {
          action: 'delete_avis',
          targetType: 'avis',
          targetId: s.cible_id,
          details: { reason: 'resolved_signalement', signalement_id: s.id },
        })
      }
      await supabase.from('signalements').update({ statut: 'accepte' }).eq('id', s.id)
      setAllSignalements(prev => prev.map(x => x.id === s.id ? { ...x, statut: 'accepte' } : x))
      await logAuditAction(supabase, { action: 'signalement_accepte', targetType: 'signalement', targetId: s.id })
    } catch (e) {
      alert('Erreur: ' + (e as Error).message)
    }
  }

  // Logout
  async function handleLogout() {
    const supabase = createClient()
    await signOut(supabase)
    router.push('/connexion')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gray-100)]">
        <div className="text-[var(--gray-500)] text-sm">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--gray-100)]">
      {/* Sidebar */}
      <div className="fixed top-0 left-0 bottom-0 w-[220px] bg-[var(--dark)] p-6 px-4 flex flex-col z-50 max-[900px]:w-[60px] max-[900px]:p-4 max-[900px]:px-2">
        <Link href="/" className="no-underline text-white font-sora font-extrabold text-xl flex items-center gap-1.5 mb-8 max-[900px]:hidden">
          artisano<span className="w-2 h-2 bg-[var(--orange)] rounded-full" />
        </Link>
        <div className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2.5 py-2.5 px-3.5 rounded-[10px] text-sm font-semibold cursor-pointer border-none text-left w-full transition-all ${
                tab === item.key
                  ? 'text-white bg-[rgba(232,112,10,0.2)]'
                  : 'text-white/55 bg-transparent hover:text-white/80 hover:bg-white/[0.06]'
              }`}
            >
              <span className="w-[18px] h-[18px] shrink-0">{item.icon}</span>
              <span className="max-[900px]:hidden">{item.label}</span>
              {item.key !== 'dashboard' && (
                <span className="ml-auto bg-[var(--orange)] text-white text-[10px] font-extrabold py-0.5 px-[7px] rounded-full max-[900px]:hidden">
                  {item.key === 'artisans' ? stats.artisans
                    : item.key === 'demandes' ? stats.demandes
                    : item.key === 'avis' ? stats.avis
                    : item.key === 'signalements' ? stats.signalementsNouveaux
                    : stats.auditCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4 border-t border-white/[0.08]">
          <button onClick={handleLogout} className="flex items-center gap-2.5 py-2.5 px-3.5 rounded-[10px] text-sm font-semibold text-white/55 cursor-pointer border-none bg-transparent text-left w-full transition-all hover:text-white/80 hover:bg-white/[0.06]">
            <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="max-[900px]:hidden">Deconnexion</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="ml-[220px] p-6 px-8 max-[900px]:ml-[60px] max-[900px]:p-4">

        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <div>
            <div className="mb-6">
              <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)]">Tableau de bord</h1>
              <p className="text-[13px] text-[var(--gray-500)] mt-0.5">Vue d&apos;ensemble de la plateforme</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-7 max-[900px]:grid-cols-2">
              {[
                { label: 'Artisans inscrits', value: stats.artisans },
                { label: 'Demandes totales', value: stats.demandes },
                { label: 'Avis publies', value: stats.avis },
                { label: 'Demandes en attente', value: stats.demandesNew },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-[var(--radius)] p-5 border border-[var(--gray-200)]">
                  <div className="font-sora text-[28px] font-extrabold text-[var(--dark)]">{s.value}</div>
                  <div className="text-xs text-[var(--gray-500)] font-semibold mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <TableWrap header={<strong className="text-sm">Derniers artisans inscrits</strong>}>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Artisan</Th><Th>Metier</Th><Th>Zone</Th><Th>Inscrit le</Th>
                  </tr>
                </thead>
                <tbody>
                  {allArtisans.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-10 text-[var(--gray-500)] text-[13px]">Aucun artisan inscrit</td></tr>
                  ) : allArtisans.slice(0, 10).map(a => (
                    <tr key={a.id} className="hover:bg-[rgba(232,112,10,0.02)]">
                      <Td><AvatarCell artisan={a} /></Td>
                      <Td>{a.metier || '-'}</Td>
                      <Td>{(a.zones || []).slice(0, 2).join(', ') || '-'}</Td>
                      <Td>{fmtDate(a.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}

        {/* ARTISANS TAB */}
        {tab === 'artisans' && (
          <div>
            <div className="mb-6">
              <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)]">Artisans</h1>
              <p className="text-[13px] text-[var(--gray-500)] mt-0.5">Gerer les artisans inscrits</p>
            </div>
            <TableWrap header={
              <input type="text" value={searchArtisans} onChange={e => setSearchArtisans(e.target.value)} placeholder="Rechercher un artisan..." className="py-2 px-3.5 border border-[var(--gray-200)] rounded-lg text-[13px] w-[260px] bg-[var(--gray-100)] focus:outline-none focus:border-[var(--orange)] focus:bg-white max-[900px]:w-full" />
            }>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Artisan</Th><Th>Metier</Th><Th>Zone</Th><Th>Email</Th><Th>Inscrit le</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArtisans.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-[var(--gray-500)] text-[13px]">Aucun artisan</td></tr>
                  ) : filteredArtisans.map(a => (
                    <tr key={a.id} className="hover:bg-[rgba(232,112,10,0.02)]">
                      <Td><AvatarCell artisan={a} /></Td>
                      <Td>{a.metier || '-'}</Td>
                      <Td>{(a.zones || []).slice(0, 2).join(', ') || '-'}</Td>
                      <Td>{a.email || '-'}</Td>
                      <Td>{fmtDate(a.created_at)}</Td>
                      <Td>
                        <Link href={`/artisan/${a.id}`} target="_blank" className="py-1 px-3 rounded-md text-[11px] font-bold border border-[var(--gray-200)] bg-white text-[var(--dark)] no-underline hover:bg-[var(--gray-100)] transition-all">Voir</Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}

        {/* DEMANDES TAB */}
        {tab === 'demandes' && (
          <div>
            <div className="mb-6">
              <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)]">Demandes</h1>
              <p className="text-[13px] text-[var(--gray-500)] mt-0.5">Toutes les demandes de service</p>
            </div>
            <TableWrap header={
              <input type="text" value={searchDemandes} onChange={e => setSearchDemandes(e.target.value)} placeholder="Rechercher..." className="py-2 px-3.5 border border-[var(--gray-200)] rounded-lg text-[13px] w-[260px] bg-[var(--gray-100)] focus:outline-none focus:border-[var(--orange)] focus:bg-white max-[900px]:w-full" />
            }>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Client</Th><Th>Artisan</Th><Th>Type</Th><Th>Statut</Th><Th>Date</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDemandes.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-[var(--gray-500)] text-[13px]">Aucune demande</td></tr>
                  ) : filteredDemandes.map(d => (
                    <tr key={d.id} className="hover:bg-[rgba(232,112,10,0.02)]">
                      <Td>{d.client_nom || d.client_email || '-'}</Td>
                      <Td>{d.artisans ? artisanName(d.artisans) : '-'}</Td>
                      <Td>{d.type === 'devis' ? 'Devis' : 'Message'}</Td>
                      <Td><StatusBadge status={d.statut} /></Td>
                      <Td>{fmtDate(d.created_at)}</Td>
                      <Td>
                        <button onClick={() => handleDeleteDemande(d.id)} className="py-1 px-3 rounded-md text-[11px] font-bold border border-[rgba(211,47,47,0.3)] bg-white text-[var(--red)] cursor-pointer hover:bg-[var(--red-light)] transition-all">Suppr.</button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}

        {/* AVIS TAB */}
        {tab === 'avis' && (
          <div>
            <div className="mb-6">
              <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)]">Avis</h1>
              <p className="text-[13px] text-[var(--gray-500)] mt-0.5">Moderation des avis clients</p>
            </div>
            <TableWrap header={
              <input type="text" value={searchAvis} onChange={e => setSearchAvis(e.target.value)} placeholder="Rechercher un avis..." className="py-2 px-3.5 border border-[var(--gray-200)] rounded-lg text-[13px] w-[260px] bg-[var(--gray-100)] focus:outline-none focus:border-[var(--orange)] focus:bg-white max-[900px]:w-full" />
            }>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Client</Th><Th>Artisan</Th><Th>Note</Th><Th>Commentaire</Th><Th>Date</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAvis.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-[var(--gray-500)] text-[13px]">Aucun avis</td></tr>
                  ) : filteredAvis.map(a => {
                    const stars = Array.from({ length: 5 }, (_, i) => i < (a.note || 0) ? '\u2605' : '\u2606').join('')
                    const comment = (a.commentaire || '').substring(0, 80) + ((a.commentaire || '').length > 80 ? '...' : '')
                    return (
                      <tr key={a.id} className="hover:bg-[rgba(232,112,10,0.02)]">
                        <Td>{a.client_nom || a.client_email || '-'}</Td>
                        <Td>{a.artisans ? artisanName(a.artisans) : '-'}</Td>
                        <Td><span className="text-[var(--orange)] tracking-wider text-sm">{stars}</span></Td>
                        <Td>{comment}</Td>
                        <Td>{fmtDate(a.created_at)}</Td>
                        <Td>
                          <button onClick={() => handleDeleteAvis(a.id)} className="py-1 px-3 rounded-md text-[11px] font-bold border border-[rgba(211,47,47,0.3)] bg-white text-[var(--red)] cursor-pointer hover:bg-[var(--red-light)] transition-all">Suppr.</button>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}

        {/* AUDIT TAB */}
        {tab === 'audit' && (
          <div>
            <div className="mb-6">
              <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)]">Journal d&apos;audit</h1>
              <p className="text-[13px] text-[var(--gray-500)] mt-0.5">Toutes les actions sensibles tracées (500 dernières)</p>
            </div>
            <TableWrap header={<strong className="text-sm">{allAudit.length} actions</strong>}>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Quand</Th><Th>Qui</Th><Th>Action</Th><Th>Cible</Th><Th>Détails</Th>
                  </tr>
                </thead>
                <tbody>
                  {allAudit.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-[var(--gray-500)] text-[13px]">Aucune action enregistrée</td></tr>
                  ) : allAudit.map(log => (
                    <tr key={log.id} className="hover:bg-[rgba(232,112,10,0.02)]">
                      <Td>{new Date(log.created_at).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Td>
                      <Td>{log.actor_email || '-'}</Td>
                      <Td><span className="inline-block py-0.5 px-2 rounded-full text-[10px] font-bold bg-[var(--gray-100)] text-[var(--gray-700)] uppercase">{log.action}</span></Td>
                      <Td>{log.target_type ? `${log.target_type}/${(log.target_id || '').slice(0, 8)}…` : '-'}</Td>
                      <Td>{log.details ? <code className="text-[11px] text-[var(--gray-700)]">{JSON.stringify(log.details).slice(0, 80)}</code> : '-'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}

        {/* SIGNALEMENTS TAB */}
        {tab === 'signalements' && (
          <div>
            <div className="mb-6">
              <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)]">Signalements</h1>
              <p className="text-[13px] text-[var(--gray-500)] mt-0.5">Modération des signalements utilisateurs</p>
            </div>
            <TableWrap header={
              <select
                value={statutFilter}
                onChange={e => setStatutFilter(e.target.value as 'tous' | Signalement['statut'])}
                className="py-2 px-3.5 border border-[var(--gray-200)] rounded-lg text-[13px] bg-[var(--gray-100)] focus:outline-none focus:border-[var(--orange)] focus:bg-white"
              >
                <option value="tous">Tous</option>
                <option value="nouveau">Nouveaux</option>
                <option value="examine">Examinés</option>
                <option value="accepte">Acceptés</option>
                <option value="rejete">Rejetés</option>
              </select>
            }>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Date</Th><Th>Cible</Th><Th>Raison</Th><Th>Détails</Th><Th>Reporter</Th><Th>Statut</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {allSignalements.filter(s => statutFilter === 'tous' || s.statut === statutFilter).length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-[var(--gray-500)] text-[13px]">Aucun signalement</td></tr>
                  ) : allSignalements
                    .filter(s => statutFilter === 'tous' || s.statut === statutFilter)
                    .map(s => (
                    <tr key={s.id} className="hover:bg-[rgba(232,112,10,0.02)]">
                      <Td>{fmtDate(s.created_at)}</Td>
                      <Td>
                        <span className="inline-block py-0.5 px-2 rounded-full text-[10px] font-bold bg-[var(--gray-100)] text-[var(--gray-700)] uppercase">{s.cible_type}</span>
                        <br />
                        <Link href={s.cible_type === 'artisan' ? `/artisan/${s.cible_id}` : '#'} target="_blank" className="text-[11px] text-[var(--orange)] underline">
                          {s.cible_id.slice(0, 8)}…
                        </Link>
                      </Td>
                      <Td>{s.raison}</Td>
                      <Td>{(s.details || '').substring(0, 80)}{(s.details || '').length > 80 ? '…' : ''}</Td>
                      <Td>{s.reporter_email || '-'}</Td>
                      <Td>
                        <span className={`inline-block py-0.5 px-2.5 rounded-full text-[11px] font-bold ${
                          s.statut === 'nouveau' ? 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]' :
                          s.statut === 'examine' ? 'bg-[var(--gray-100)] text-[var(--gray-700)]' :
                          s.statut === 'accepte' ? 'bg-[var(--green-light)] text-[var(--green)]' :
                          'bg-[var(--red-light)] text-[var(--red)]'
                        }`}>{s.statut}</span>
                      </Td>
                      <Td>
                        <div className="flex gap-1 flex-wrap">
                          {s.statut === 'nouveau' && (
                            <>
                              <button onClick={() => handleResolveSignalement(s)} className="py-1 px-2 rounded-md text-[10px] font-bold bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:opacity-80">Accepter & supprimer</button>
                              <button onClick={() => updateSignalementStatut(s.id, 'rejete')} className="py-1 px-2 rounded-md text-[10px] font-bold bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)]">Rejeter</button>
                            </>
                          )}
                          {s.statut !== 'nouveau' && (
                            <button onClick={() => updateSignalementStatut(s.id, 'nouveau')} className="py-1 px-2 rounded-md text-[10px] font-bold bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)]">Rouvrir</button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Sub-components =====

function TableWrap({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden">
      <div className="p-4 px-5 border-b border-[var(--gray-100)] flex items-center justify-between gap-3 max-[900px]:flex-col">{header}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left py-2.5 px-4 text-[11px] font-bold text-[var(--gray-500)] uppercase tracking-wider bg-[var(--gray-50)] border-b border-[var(--gray-100)]">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-3 px-4 text-[13px] text-[var(--dark)] border-b border-[var(--gray-50)]">{children}</td>
}

function AvatarCell({ artisan }: { artisan: Artisan }) {
  const name = artisanName(artisan)
  const ini = artisanInitials(artisan)
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-8 h-8 rounded-full bg-[var(--gray-200)] flex items-center justify-center text-[11px] font-bold text-[var(--dark)] overflow-hidden shrink-0">
        {artisan.avatar_url ? <Image src={artisan.avatar_url} alt="" fill sizes="32px" className="object-cover" /> : ini}
      </div>
      <span>{name}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    nouvelle: { label: 'En attente', cls: 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]' },
    confirmee: { label: 'Confirmee', cls: 'bg-[var(--green-light)] text-[var(--green)]' },
    acceptee: { label: 'Acceptee', cls: 'bg-[var(--green-light)] text-[var(--green)]' },
    refusee: { label: 'Refusee', cls: 'bg-[var(--red-light)] text-[var(--red)]' },
    terminee: { label: 'Terminee', cls: 'bg-[var(--gray-100)] text-[var(--gray-500)]' },
  }
  const s = map[status] || { label: status, cls: 'bg-[var(--gray-100)] text-[var(--gray-500)]' }
  return <span className={`inline-block py-0.5 px-2.5 rounded-full text-[11px] font-bold ${s.cls}`}>{s.label}</span>
}

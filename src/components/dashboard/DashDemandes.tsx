'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  updateDemandeStatus, deleteDemande as deleteDemandeDB,
  loadMessages, sendMessage, markMessagesRead,
  replyToAvis, loadAllUnreadCounts,
} from '@/lib/supabase/helpers'
import type { Demande, Avis, Message } from '@/lib/supabase/helpers'
import { useRealtimeMessages, useRealtimeIncomingMessages } from '@/lib/hooks/useRealtimeMessages'
import { useRealtimeArtisanDemandes } from '@/lib/hooks/useRealtimeDemandes'
import { notify } from '@/lib/email/notify'
import { GROUPES, compterParGroupe, couleurStatut, groupeDemande, ilYA, libelleStatut, libelleType, messageRefus, type GroupeDemande } from '@/lib/demandes'
import { telHref } from '@/lib/phone'
import Dialog from '@/components/ui/Dialog'
import RequestProgress from '@/components/demandes/RequestProgress'

function statusIconBg(s: string): string {
  const g = groupeDemande(s)
  if (g === 'en_cours' || g === 'terminees') return 'bg-[var(--green-light)]'
  if (g === 'refusees') return 'bg-[var(--red-light)]'
  return 'bg-[rgba(232,112,10,0.1)]'
}

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'réessayez dans un instant')

type Props = {
  demandes: Demande[]
  setDemandes: (fn: (prev: Demande[]) => Demande[]) => void
  avis: Avis[]
  setAvis: (fn: (prev: Avis[]) => Avis[]) => void
  userId: string
}

export default function DashDemandes({ demandes, setDemandes, avis, setAvis, userId }: Props) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Detail modal
  const [selectedDemande, setSelectedDemande] = useState<Demande | null>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Refuse modal
  const [refuseTarget, setRefuseTarget] = useState<{ id: string; name: string } | null>(null)
  const [refuseReason, setRefuseReason] = useState('')
  const [refuseOther, setRefuseOther] = useState('')

  // Reply to avis
  const [replyingAvisId, setReplyingAvisId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  // Filtre par statut (boîte de réception) + erreurs affichées dans la page
  const [filtre, setFiltre] = useState<GroupeDemande | 'toutes'>('toutes')
  const [erreur, setErreur] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Demande | null>(null)
  const [refusing, setRefusing] = useState(false)

  const counts = useMemo(() => compterParGroupe(demandes.map((d) => d.statut)), [demandes])
  const visibles = useMemo(
    () => (filtre === 'toutes' ? demandes : demandes.filter((d) => groupeDemande(d.statut) === filtre)),
    [demandes, filtre],
  )

  // Load unread badges — UNE seule requête RPC agrégée (au lieu de N requêtes)
  useEffect(() => {
    if (demandes.length === 0) return
    const supabase = createClient()
    loadAllUnreadCounts(supabase, 'artisan')
      .then((counts) => setUnreadCounts(counts))
      .catch(() => {})
    // Volontairement déclenché seulement quand la liste de demandes change,
    // pas à chaque setUnreadCounts (qui est mis à jour par realtime + clic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandes.length])

  // Demande actions
  const acceptDemande = useCallback(async (id: string) => {
    const supabase = createClient()
    try {
      await updateDemandeStatus(supabase, id, 'acceptee')
      setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut: 'acceptee' } : d))
      setSelectedDemande(prev => prev && prev.id === id ? { ...prev, statut: 'acceptee' } : prev)
      notify.demandeStatus(id)
    } catch (e) { setErreur(`La demande n’a pas pu être acceptée : ${errMsg(e)}`) }
  }, [setDemandes])

  const completeDemande = useCallback(async (id: string) => {
    const supabase = createClient()
    try {
      await updateDemandeStatus(supabase, id, 'terminee')
      setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut: 'terminee' } : d))
      setSelectedDemande(prev => prev && prev.id === id ? { ...prev, statut: 'terminee' } : prev)
      notify.demandeStatus(id)
    } catch (e) { setErreur(`La demande n’a pas pu être marquée comme terminée : ${errMsg(e)}`) }
  }, [setDemandes])

  const deleteDemande = useCallback(async (id: string) => {
    const supabase = createClient()
    try {
      await deleteDemandeDB(supabase, id)
      setDemandes(prev => prev.filter(d => d.id !== id))
      setDeleteTarget(null)
    } catch (e) { setDeleteTarget(null); setErreur(`La demande n’a pas pu être supprimée : ${errMsg(e)}`) }
  }, [setDemandes])

  // Le motif était demandé puis perdu : il est maintenant envoyé au client
  // dans la conversation de la demande (et donc par email, via /api/messages).
  const confirmRefuse = useCallback(async () => {
    if (!refuseReason || !refuseTarget) return
    const supabase = createClient()
    setRefusing(true)
    try {
      await updateDemandeStatus(supabase, refuseTarget.id, 'refusee')
      setDemandes(prev => prev.map(d => d.id === refuseTarget.id ? { ...d, statut: 'refusee' } : d))
      notify.demandeStatus(refuseTarget.id)
      try {
        await sendMessage(supabase, refuseTarget.id, 'artisan', userId, messageRefus(refuseReason, refuseOther))
      } catch {
        setErreur('Demande refusée, mais le motif n’a pas pu être envoyé au client. Vous pouvez lui écrire depuis la conversation.')
      }
      setRefuseTarget(null)
      setRefuseReason('')
      setRefuseOther('')
    } catch (e) {
      setRefuseTarget(null)
      setErreur(`La demande n’a pas pu être refusée : ${errMsg(e)}`)
    } finally {
      setRefusing(false)
    }
  }, [refuseTarget, refuseReason, refuseOther, setDemandes, userId])

  // View detail
  const openDetail = useCallback(async (d: Demande) => {
    setSelectedDemande(d)
    setChatLoading(true)
    setChatMessages([])
    setChatInput('')
    const supabase = createClient()
    try {
      const msgs = await loadMessages(supabase, d.id)
      setChatMessages(msgs)
      await markMessagesRead(supabase, d.id, 'artisan')
      setUnreadCounts(prev => { const copy = { ...prev }; delete copy[d.id]; return copy })
    } catch { /* ignore */ }
    setChatLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  // Realtime : nouveaux messages dans la demande ouverte
  const handleRealtimeMessage = useCallback((msg: Message) => {
    setChatMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    if (msg.sender_type === 'client' && selectedDemande?.id === msg.demande_id) {
      const supabase = createClient()
      markMessagesRead(supabase, msg.demande_id, 'artisan').catch(() => {})
    }
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [selectedDemande])
  useRealtimeMessages(selectedDemande?.id, handleRealtimeMessage)

  // Realtime : badges non lus sur les autres demandes
  const handleIncoming = useCallback((msg: Message) => {
    if (selectedDemande?.id === msg.demande_id) return
    setUnreadCounts(prev => ({ ...prev, [msg.demande_id]: (prev[msg.demande_id] || 0) + 1 }))
  }, [selectedDemande])
  useRealtimeIncomingMessages(demandes.map(d => d.id), 'artisan', handleIncoming)

  // Realtime : nouvelles demandes / changements de statut / suppressions
  useRealtimeArtisanDemandes(userId, {
    onInsert: (created) => {
      setDemandes(prev => prev.some(d => d.id === created.id) ? prev : [created, ...prev])
    },
    onUpdate: (updated) => {
      setDemandes(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
    },
    onDelete: (id) => {
      setDemandes(prev => prev.filter(d => d.id !== id))
    },
  })

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !selectedDemande) return
    const text = chatInput.trim()
    setChatInput('')
    const supabase = createClient()
    try {
      // L'email de notification est désormais envoyé côté serveur par /api/messages
      await sendMessage(supabase, selectedDemande.id, 'artisan', userId, text)
      const msgs = await loadMessages(supabase, selectedDemande.id)
      setChatMessages(msgs)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      setChatInput(text)
      setErreur(`Le message n’a pas pu être envoyé : ${errMsg(e)}`)
    }
  }, [chatInput, selectedDemande, userId])

  // Reply to avis
  const handleSendReply = useCallback(async (avisId: string) => {
    if (!replyText.trim()) return
    const supabase = createClient()
    try {
      await replyToAvis(supabase, avisId, replyText.trim())
      setAvis(prev => prev.map(a => a.id === avisId ? { ...a, reponse_artisan: replyText.trim(), reponse_date: new Date().toISOString() } : a))
      setReplyingAvisId(null)
      setReplyText('')
    } catch (e) { setErreur(`La réponse n’a pas pu être publiée : ${errMsg(e)}`) }
  }, [replyText, setAvis])

  // Lien direct depuis les emails : /dashboard?demande=<id> ouvre la demande
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (deepLinkDone.current || demandes.length === 0) return
    const id = new URLSearchParams(window.location.search).get('demande')
    if (!id) { deepLinkDone.current = true; return }
    const d = demandes.find((x) => x.id === id)
    if (d) {
      deepLinkDone.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openDetail(d)
    }
  }, [demandes, openDetail])

  const refuseReasons = [
    'Calendrier complet',
    'Hors zone de service',
    'Type de travail non couvert',
    'Autre raison',
  ]

  const telClient = selectedDemande ? telHref(selectedDemande.client_telephone) : ''

  return (
    <>
      {erreur && (
        <div role="alert" className="mb-4 flex items-start gap-3 bg-[var(--red-light)] text-[var(--red)] rounded-[var(--radius-sm)] p-3.5 text-sm font-semibold">
          <span className="flex-1">{erreur}</span>
          <button onClick={() => setErreur('')} aria-label="Fermer le message d’erreur" className="shrink-0 bg-transparent border-none cursor-pointer text-[var(--red)] p-0.5">
            <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="grid gap-6 grid-cols-[1fr_340px] max-[900px]:grid-cols-1">
        {/* Main: boîte de réception des demandes */}
        <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden">
          <div className="p-5 pb-4 border-b border-[var(--gray-100)] max-[600px]:p-4">
            <h2 className="font-sora font-bold text-lg mb-3 max-[600px]:text-base">Demandes</h2>
            {/* Filtres par statut avec compteurs (modèle Base44 / Airbnb, via Mobbin) */}
            <div role="group" aria-label="Filtrer les demandes" className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
              {GROUPES.map(({ key, label }) => {
                const active = filtre === key
                const n = counts[key]
                return (
                  <button
                    key={key}
                    onClick={() => setFiltre(key)}
                    aria-pressed={active}
                    className={`shrink-0 inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-[13px] font-semibold border cursor-pointer transition-colors ${
                      active ? 'bg-[var(--dark)] text-white border-[var(--dark)]' : 'bg-white text-[var(--gray-700)] border-[var(--gray-200)] hover:border-[var(--gray-300)]'
                    }`}
                  >
                    {label}
                    <span className={`min-w-5 px-1.5 rounded-full text-[11px] leading-5 text-center ${
                      active ? 'bg-white/20 text-white' : key === 'nouvelles' && n > 0 ? 'bg-[var(--orange)] text-white' : 'bg-[var(--gray-100)] text-[var(--gray-500)]'
                    }`}>{n}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="p-0">
            {demandes.length === 0 ? (
              <div className="text-center py-12 px-4">
                <svg aria-hidden="true" className="w-10 h-10 mx-auto mb-3 text-[var(--gray-300)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>
                <div className="font-sora font-bold text-[15px] text-[var(--dark)]">Aucune demande pour le moment</div>
                <div className="text-[var(--gray-500)] text-[13px] mt-1 mb-4">Les demandes de vos clients apparaîtront ici. Un profil complet et des disponibilités publiées en attirent davantage.</div>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Link href="/mon-profil" className="text-[13px] font-semibold py-2 px-4 rounded-full bg-[var(--dark)] text-white no-underline hover:bg-[var(--orange)] transition-colors">Compléter mon profil</Link>
                  <Link href={`/artisan/${userId}`} className="text-[13px] font-semibold py-2 px-4 rounded-full border border-[var(--gray-300)] text-[var(--dark)] no-underline hover:border-[var(--dark)] transition-colors">Voir mon profil public</Link>
                </div>
              </div>
            ) : visibles.length === 0 ? (
              <div className="text-center py-10 px-4 text-sm text-[var(--gray-500)]">
                Aucune demande dans « {GROUPES.find((g) => g.key === filtre)?.label} ».{' '}
                <button onClick={() => setFiltre('toutes')} className="bg-transparent border-none p-0 text-[var(--orange)] font-semibold cursor-pointer hover:underline">Voir toutes les demandes</button>
              </div>
            ) : (
              visibles.map(d => {
                const meta = [d.moment_journee, libelleType(d.type), ilYA(d.created_at)].filter(Boolean).join(' · ')
                const unread = unreadCounts[d.id] || 0
                return (
                  <div key={d.id} className={`flex items-start gap-4 p-5 border-b border-[var(--gray-100)] last:border-0 hover:bg-[var(--gray-50)] transition-colors max-[600px]:p-4 max-[600px]:gap-3 max-[600px]:flex-col ${d.statut === 'nouvelle' ? 'shadow-[inset_3px_0_0_var(--orange)]' : ''}`}>
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${statusIconBg(d.statut)} max-[600px]:hidden`}>
                      {d.type === 'devis' ? (
                        <svg aria-hidden="true" className="w-[18px] h-[18px] text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      ) : (
                        <svg aria-hidden="true" className="w-[18px] h-[18px] text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      )}
                    </div>
                    {/* Body */}
                    <button onClick={() => openDetail(d)} className="flex-1 min-w-0 text-left bg-transparent border-none p-0 cursor-pointer max-[600px]:w-full">
                      <span className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-sora font-bold text-[15px] text-[var(--dark)] max-[600px]:text-sm">{d.client_nom || 'Client anonyme'}</span>
                        <span className={`inline-block py-0.5 px-2 rounded-full text-[10px] font-bold ${couleurStatut(d.statut)}`}>{libelleStatut(d.statut, 'artisan')}</span>
                        {unread > 0 && (
                          <span className="py-0.5 px-2 rounded-full text-[10px] font-bold bg-[var(--orange)] text-white">
                            {unread} message{unread > 1 ? 's' : ''} non lu{unread > 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-[var(--gray-700)] mb-1.5 leading-relaxed truncate">{(d.message || 'Pas de message').substring(0, 100)}</span>
                      <span className="block text-xs text-[var(--gray-500)]">{meta}</span>
                    </button>
                    {/* Actions */}
                    <div className="flex gap-1.5 shrink-0 flex-wrap max-[600px]:w-full">
                      {d.statut === 'nouvelle' && (
                        <>
                          <button onClick={() => acceptDemande(d.id)} className="text-xs font-bold py-2 px-3.5 rounded-lg bg-[var(--green)] text-white border-none cursor-pointer hover:brightness-110 transition-all">Accepter</button>
                          <button onClick={() => setRefuseTarget({ id: d.id, name: d.client_nom || 'Client' })} className="text-xs font-bold py-2 px-3.5 rounded-lg bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:bg-[rgba(211,47,47,0.12)] transition-colors">Refuser</button>
                        </>
                      )}
                      {(d.statut === 'confirmee' || d.statut === 'acceptee') && (
                        <button onClick={() => completeDemande(d.id)} className="text-xs font-bold py-2 px-3.5 rounded-lg bg-[#2E7D32] text-white border-none cursor-pointer hover:brightness-110 transition-all">Terminer</button>
                      )}
                      <button onClick={() => openDetail(d)} className="text-xs font-bold py-2 px-3.5 rounded-lg bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Ouvrir</button>
                      <button onClick={() => setDeleteTarget(d)} aria-label={`Supprimer la demande de ${d.client_nom || 'ce client'}`} className="text-xs font-bold py-2 px-3 rounded-lg bg-transparent text-[var(--gray-500)] border border-[var(--gray-200)] cursor-pointer hover:text-[var(--red)] hover:border-[var(--red)] transition-colors">
                        <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        {/* Sidebar: Avis + Abo */}
        <div className="flex flex-col gap-4">
          {/* Avis */}
          <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden">
            <div className="p-4 border-b border-[var(--gray-100)]">
              <h2 className="font-sora font-bold text-sm">Derniers avis</h2>
            </div>
            <div className="p-0">
              {avis.length === 0 ? (
                <div className="text-center py-6 text-[var(--gray-500)] text-xs">Aucun avis reçu</div>
              ) : (
                avis.slice(0, 5).map(a => {
                  const nom = a.client_nom || 'Client'
                  const initials = nom.split(' ').map(w => w[0]).join('').substring(0, 2) + '.'
                  const stars = '★'.repeat(a.note) + '☆'.repeat(5 - a.note)
                  return (
                    <div key={a.id} className="p-4 border-b border-[var(--gray-100)] last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-[var(--dark)]">{initials}</span>
                        <span className="text-[var(--yellow)] text-sm tracking-wider">{stars}</span>
                      </div>
                      {a.commentaire && (
                        <div className="text-xs text-[var(--gray-700)] mb-2 leading-relaxed">{a.commentaire.substring(0, 80)}{a.commentaire.length > 80 ? '...' : ''}</div>
                      )}
                      {a.reponse_artisan ? (
                        <div className="bg-[var(--gray-50)] p-2.5 rounded-lg text-xs text-[var(--gray-700)] mt-1.5">
                          <strong className="text-[var(--dark)]">Votre réponse</strong>
                          <div className="mt-0.5">{a.reponse_artisan.substring(0, 100)}{a.reponse_artisan.length > 100 ? '...' : ''}</div>
                        </div>
                      ) : replyingAvisId === a.id ? (
                        <div className="mt-2">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Votre réponse..."
                            className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-xs outline-none focus:border-[var(--orange)] resize-y min-h-[60px]"
                          />
                          <div className="flex gap-2 mt-1.5">
                            <button onClick={() => { setReplyingAvisId(null); setReplyText('') }} className="text-[11px] font-semibold py-1 px-3 rounded-md bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
                            <button onClick={() => handleSendReply(a.id)} className="text-[11px] font-semibold py-1 px-3 rounded-md bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)]">Envoyer</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReplyingAvisId(a.id); setReplyText('') }} className="text-[11px] font-semibold text-[var(--orange)] hover:underline border-none bg-transparent cursor-pointer p-0 mt-1">Répondre</button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Accès bêta — la carte « 25 CHF / Actif / renouvellement » était fictive :
              aucun paiement n'existe et les CGU (§6) rendent la bêta gratuite. */}
          <div className="bg-gradient-to-br from-[var(--dark)] to-[var(--dark-mid)] rounded-[var(--radius)] p-5 text-white">
            <div className="text-xs text-white/60 mb-2">Votre accès</div>
            <div className="font-sora text-xl font-extrabold">Bêta gratuite</div>
            <p className="text-xs text-white/70 mt-2 leading-relaxed">
              Toutes les fonctionnalités sont offertes pendant la bêta. Un éventuel abonnement vous sera annoncé au moins 30 jours à l’avance et ne démarrera qu’avec votre accord.
            </p>
            <Link href={`/artisan/${userId}`} className="block text-center w-full mt-4 py-2.5 rounded-full text-xs font-bold bg-white/10 text-white border border-white/20 no-underline hover:bg-white/20 transition-colors">
              Voir mon profil public
            </Link>
          </div>
        </div>
      </div>

      {/* ===== DEMANDE DETAIL MODAL ===== */}
      {selectedDemande && (
        <Dialog onClose={() => setSelectedDemande(null)} labelledBy="demande-detail-titre" className="max-w-[620px] max-h-[85vh] flex flex-col overflow-hidden max-[600px]:max-h-[92vh] max-[600px]:m-1">
            {/* Modal header */}
            <div className="p-6 border-b border-[var(--gray-200)] shrink-0 max-[600px]:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 id="demande-detail-titre" className="font-sora font-bold text-lg">{selectedDemande.client_nom || 'Client anonyme'}</h3>
                <button onClick={() => setSelectedDemande(null)} aria-label="Fermer" className="w-8 h-8 rounded-lg bg-[var(--gray-100)] flex items-center justify-center text-[var(--gray-500)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className={`inline-block py-1 px-2.5 rounded-full text-[11px] font-bold ${couleurStatut(selectedDemande.statut)}`}>{libelleStatut(selectedDemande.statut, 'artisan')}</span>
                <span className="inline-block py-1 px-2.5 rounded-full text-[11px] font-bold bg-[var(--gray-100)] text-[var(--gray-500)]">
                  {libelleType(selectedDemande.type)}
                </span>
              </div>
              <RequestProgress statut={selectedDemande.statut} className="mt-4 max-w-[360px]" />
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6 max-[600px]:p-4">
              {/* Contact */}
              <div className="grid grid-cols-2 gap-2 mb-4 max-[500px]:grid-cols-1">
                {selectedDemande.client_email && (
                  <a href={`mailto:${selectedDemande.client_email}`} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--gray-50)] text-sm text-[var(--dark)] no-underline hover:bg-[var(--gray-100)] transition-colors">
                    <svg className="w-4 h-4 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span className="truncate">{selectedDemande.client_email}</span>
                  </a>
                )}
                {selectedDemande.client_telephone && (
                  <a href={telClient || undefined} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--gray-50)] text-sm text-[var(--dark)] no-underline hover:bg-[var(--gray-100)] transition-colors">
                    <svg className="w-4 h-4 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    <span className="truncate">{selectedDemande.client_telephone}</span>
                  </a>
                )}
              </div>

              {/* Date info */}
              <div className="text-sm text-[var(--gray-700)] mb-4 leading-relaxed space-y-0.5">
                {selectedDemande.client_adresse && <div>Adresse : <strong>{selectedDemande.client_adresse}</strong></div>}
                {selectedDemande.date_souhaitee && <div>Date souhaitée : <strong>{selectedDemande.date_souhaitee}</strong></div>}
                {selectedDemande.moment_journee && <div>Moment : <strong>{selectedDemande.moment_journee}</strong></div>}
                <div>Reçue : <strong>{ilYA(selectedDemande.created_at)}</strong></div>
              </div>

              {/* Message */}
              <div className="bg-[var(--gray-50)] p-4 rounded-[var(--radius-sm)] mb-6 text-sm leading-relaxed">
                {selectedDemande.message || '(pas de message)'}
              </div>

              {/* Chat */}
              <div className="font-sora font-bold text-sm mb-3">Messages</div>
              <div className="bg-[var(--gray-50)] rounded-[var(--radius-sm)] p-4 min-h-[120px] max-h-[280px] overflow-y-auto mb-3">
                {chatLoading ? (
                  <div className="text-center text-[var(--gray-500)] text-sm py-4">Chargement...</div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-center text-[var(--gray-500)] text-sm py-4">Aucun message. Envoyez le premier !</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {chatMessages.map(m => {
                      const t = new Date(m.created_at)
                      const timeStr = `${t.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })} ${t.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`
                      return (
                        <div key={m.id} className={`max-w-[80%] p-3 rounded-xl text-sm leading-relaxed ${
                          m.sender_type === 'artisan' ? 'ml-auto bg-[var(--orange)] text-white rounded-br-sm' : 'mr-auto bg-white border border-[var(--gray-200)] rounded-bl-sm'
                        }`}>
                          {m.sender_type === 'client' && (
                            <div className="text-xs font-bold text-[var(--orange)] mb-1">{selectedDemande.client_nom || 'Client'}</div>
                          )}
                          <span className="whitespace-pre-line">{m.content}</span>
                          <div className={`text-[10px] mt-1.5 ${m.sender_type === 'artisan' ? 'text-white/60' : 'text-[var(--gray-500)]'}`}>{timeStr}</div>
                        </div>
                      )
                    })}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Écrire un message..."
                  aria-label="Votre message au client"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendMessage() }}
                  className="flex-1 py-2.5 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)]"
                />
                <button onClick={handleSendMessage} aria-label="Envoyer le message" className="bg-[var(--orange)] text-white py-2.5 px-4 rounded-[var(--radius-sm)] font-semibold text-sm border-none cursor-pointer transition-all hover:bg-[var(--orange-dark)]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-4 border-t border-[var(--gray-200)] shrink-0 flex gap-2 justify-end">
              {selectedDemande.statut === 'nouvelle' && (
                <>
                  <button onClick={() => { setRefuseTarget({ id: selectedDemande.id, name: selectedDemande.client_nom || 'Client' }); setSelectedDemande(null) }} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Refuser</button>
                  <button onClick={() => acceptDemande(selectedDemande.id)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--green)] text-white border-none cursor-pointer hover:brightness-110 transition-all">Accepter</button>
                </>
              )}
              {(selectedDemande.statut === 'confirmee' || selectedDemande.statut === 'acceptee') && (
                <button onClick={() => completeDemande(selectedDemande.id)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[#2E7D32] text-white border-none cursor-pointer hover:brightness-110 transition-all">Marquer comme terminé</button>
              )}
              <button onClick={() => setSelectedDemande(null)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Fermer</button>
            </div>
        </Dialog>
      )}

      {/* ===== REFUSE MODAL ===== */}
      {refuseTarget && (
        <Dialog onClose={() => setRefuseTarget(null)} labelledBy="refus-titre" className="max-w-[440px] p-6 max-[600px]:p-5">
            <h3 id="refus-titre" className="font-sora font-bold text-lg mb-1">Refuser la demande</h3>
            <p className="text-sm text-[var(--gray-500)] mb-5">
              Le motif est envoyé à <strong>{refuseTarget.name}</strong> dans la conversation, pour qu’il puisse chercher un autre artisan.
            </p>

            <div className="flex flex-col gap-2 mb-4">
              {refuseReasons.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 rounded-[var(--radius-sm)] border-2 cursor-pointer transition-all ${refuseReason === r ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.04)]' : 'border-[var(--gray-200)] hover:border-[var(--gray-300)]'}`}>
                  <input type="radio" name="refuse" checked={refuseReason === r} onChange={() => setRefuseReason(r)} className="accent-[var(--orange)]" />
                  <span className="text-sm font-medium">{r}</span>
                </label>
              ))}
            </div>
            {refuseReason === 'Autre raison' && (
              <textarea
                value={refuseOther}
                onChange={e => setRefuseOther(e.target.value)}
                aria-label="Précision sur le motif"
                placeholder="Précisez la raison..."
                className="w-full py-3 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--orange)] resize-y min-h-[80px] mb-4"
              />
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRefuseTarget(null)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
              <button onClick={confirmRefuse} disabled={!refuseReason || refusing} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--red)] text-white border-none cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed">
                {refusing ? 'Envoi…' : 'Refuser et prévenir le client'}
              </button>
            </div>
        </Dialog>
      )}

      {/* ===== DELETE CONFIRMATION ===== */}
      {deleteTarget && (
        <Dialog onClose={() => setDeleteTarget(null)} labelledBy="suppr-titre" className="max-w-[420px] p-6 max-[600px]:p-5">
          <h3 id="suppr-titre" className="font-sora font-bold text-lg mb-1">Supprimer cette demande&nbsp;?</h3>
          <p className="text-sm text-[var(--gray-500)] mb-5">
            La demande de <strong>{deleteTarget.client_nom || 'ce client'}</strong> et sa conversation disparaîtront de votre tableau de bord. Cette action est définitive.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
            <button onClick={() => deleteDemande(deleteTarget.id)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--red)] text-white border-none cursor-pointer hover:brightness-110">Supprimer</button>
          </div>
        </Dialog>
      )}
    </>
  )
}

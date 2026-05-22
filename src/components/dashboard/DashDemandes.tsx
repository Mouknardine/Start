'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  updateDemandeStatus, deleteDemande as deleteDemandeDB,
  loadMessages, sendMessage, markMessagesRead,
  replyToAvis, loadAvisForArtisan, loadAllUnreadCounts,
} from '@/lib/supabase/helpers'
import type { Demande, Avis, Message } from '@/lib/supabase/helpers'
import { useRealtimeMessages, useRealtimeIncomingMessages } from '@/lib/hooks/useRealtimeMessages'
import { useRealtimeArtisanDemandes } from '@/lib/hooks/useRealtimeDemandes'
import { notify } from '@/lib/email/notify'

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'Hier'
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} jours`
  return new Date(dateStr).toLocaleDateString('fr-CH')
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { nouvelle: 'Nouvelle', confirmee: 'Confirmée', acceptee: 'Acceptée', refusee: 'Refusée', terminee: 'Terminée' }
  return map[s] || 'Nouvelle'
}

function statusColor(s: string): string {
  if (s === 'terminee') return 'bg-[rgba(46,125,50,0.1)] text-[#2E7D32]'
  if (s === 'confirmee' || s === 'acceptee') return 'bg-[var(--green-light)] text-[var(--green)]'
  if (s === 'refusee') return 'bg-[var(--red-light)] text-[var(--red)]'
  return 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]'
}

function statusIconBg(s: string): string {
  if (s === 'terminee' || s === 'confirmee' || s === 'acceptee') return 'bg-[var(--green-light)]'
  if (s === 'refusee') return 'bg-[var(--red-light)]'
  return 'bg-[rgba(232,112,10,0.1)]'
}

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
      notify.demandeStatus(id)
    } catch (e) { alert('Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [setDemandes])

  const completeDemande = useCallback(async (id: string) => {
    const supabase = createClient()
    try {
      await updateDemandeStatus(supabase, id, 'terminee')
      setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut: 'terminee' } : d))
      notify.demandeStatus(id)
    } catch (e) { alert('Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [setDemandes])

  const deleteDemande = useCallback(async (id: string) => {
    if (!confirm('Supprimer cette demande ?')) return
    const supabase = createClient()
    try {
      await deleteDemandeDB(supabase, id)
      setDemandes(prev => prev.filter(d => d.id !== id))
    } catch (e) { alert('Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [setDemandes])

  const confirmRefuse = useCallback(async () => {
    if (!refuseReason) { alert('Veuillez sélectionner une raison.'); return }
    if (!refuseTarget) return
    const supabase = createClient()
    try {
      await updateDemandeStatus(supabase, refuseTarget.id, 'refusee')
      setDemandes(prev => prev.map(d => d.id === refuseTarget.id ? { ...d, statut: 'refusee' } : d))
      notify.demandeStatus(refuseTarget.id)
      setRefuseTarget(null)
      setRefuseReason('')
      setRefuseOther('')
    } catch (e) { alert('Erreur: ' + (e instanceof Error ? e.message : '')); setRefuseTarget(null) }
  }, [refuseTarget, refuseReason, setDemandes])

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
      const sent = await sendMessage(supabase, selectedDemande.id, 'artisan', userId, text)
      const msgs = await loadMessages(supabase, selectedDemande.id)
      setChatMessages(msgs)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      if (sent?.id) notify.newMessage(sent.id)
    } catch (e) { alert('Erreur envoi: ' + (e instanceof Error ? e.message : '')) }
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
    } catch (e) { alert('Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [replyText, setAvis])

  const refuseReasons = [
    'Calendrier complet',
    'Hors zone de service',
    'Type de travail non couvert',
    'Autre raison',
  ]

  return (
    <>
      <div className="grid gap-6 max-[900px]:grid-cols-1" style={{ gridTemplateColumns: '1fr 340px' }}>
        {/* Main: Demandes List */}
        <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-[var(--gray-100)] max-[600px]:p-4">
            <h2 className="font-sora font-bold text-lg max-[600px]:text-base">Dernières demandes</h2>
          </div>
          <div className="p-0">
            {demandes.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="text-4xl mb-3">📭</div>
                <div className="text-[var(--gray-500)] text-sm">Aucune demande pour le moment</div>
                <div className="text-[var(--gray-500)] text-xs mt-1">Les demandes de vos clients apparaîtront ici</div>
              </div>
            ) : (
              demandes.map(d => {
                const typeLabel = d.type === 'devis' ? 'Devis' : d.type === 'message' ? 'Message' : 'Rendez-vous'
                const meta = [d.moment_journee, typeLabel, timeAgo(d.created_at)].filter(Boolean).join(' · ')
                return (
                  <div key={d.id} className="flex items-start gap-4 p-5 border-b border-[var(--gray-100)] last:border-0 hover:bg-[var(--gray-50)] transition-colors max-[600px]:p-4 max-[600px]:gap-3 max-[600px]:flex-col">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${statusIconBg(d.statut)} max-[600px]:hidden`}>
                      {d.type === 'devis' ? (
                        <svg className="w-[18px] h-[18px] text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      ) : (
                        <svg className="w-[18px] h-[18px] text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      )}
                    </div>
                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-sora font-bold text-[15px] text-[var(--dark)] max-[600px]:text-sm">{d.client_nom || 'Client anonyme'}</span>
                        <span className={`inline-block py-0.5 px-2 rounded-full text-[10px] font-bold ${statusColor(d.statut)}`}>{statusLabel(d.statut)}</span>
                        {unreadCounts[d.id] && (
                          <button onClick={() => openDetail(d)} className="py-0.5 px-2 rounded-full text-[10px] font-bold bg-[var(--orange)] text-white border-none cursor-pointer animate-pulse">
                            {unreadCounts[d.id]}
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-[var(--gray-700)] mb-1.5 leading-relaxed truncate">{(d.message || 'Pas de message').substring(0, 100)}</div>
                      <div className="text-xs text-[var(--gray-500)]">{meta}</div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1.5 shrink-0 flex-wrap max-[600px]:w-full">
                      {d.statut === 'nouvelle' && (
                        <>
                          <button onClick={() => acceptDemande(d.id)} className="text-[11px] font-bold py-1.5 px-3 rounded-lg bg-[var(--green)] text-white border-none cursor-pointer hover:brightness-110 transition-all">Accepter</button>
                          <button onClick={() => setRefuseTarget({ id: d.id, name: d.client_nom || 'Client' })} className="text-[11px] font-bold py-1.5 px-3 rounded-lg bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:bg-[rgba(211,47,47,0.12)] transition-colors">Refuser</button>
                        </>
                      )}
                      {(d.statut === 'confirmee' || d.statut === 'acceptee') && (
                        <button onClick={() => completeDemande(d.id)} className="text-[11px] font-bold py-1.5 px-3 rounded-lg bg-[#2E7D32] text-white border-none cursor-pointer hover:brightness-110 transition-all">Terminer</button>
                      )}
                      <button onClick={() => openDetail(d)} className="text-[11px] font-bold py-1.5 px-3 rounded-lg bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Voir</button>
                      <button onClick={() => deleteDemande(d.id)} className="text-[11px] font-bold py-1.5 px-3 rounded-lg bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:bg-[rgba(211,47,47,0.12)] transition-colors">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Sidebar: Avis + Abo */}
        <div className="flex flex-col gap-4 max-[900px]:order-first">
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

          {/* Abo Card */}
          <div className="bg-gradient-to-br from-[var(--dark)] to-[var(--dark-mid)] rounded-[var(--radius)] p-5 text-white">
            <div className="text-xs text-white/50 mb-2">Votre abonnement</div>
            <div className="font-sora text-2xl font-extrabold">25 CHF <span className="text-sm font-normal text-white/60">/ mois</span></div>
            <div className="inline-block mt-2 py-1 px-2.5 rounded-full text-[10px] font-bold bg-[var(--green)] text-white">Actif</div>
            <div className="text-xs text-white/40 mt-3">Renouvellement le 1er avril 2026</div>
            <button className="w-full mt-4 py-2.5 rounded-full text-xs font-bold bg-white/10 text-white border border-white/20 cursor-pointer hover:bg-white/20 transition-colors">Gérer mon abonnement</button>
          </div>
        </div>
      </div>

      {/* ===== DEMANDE DETAIL MODAL ===== */}
      {selectedDemande && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setSelectedDemande(null) }}>
          <div className="bg-white rounded-[var(--radius)] w-full max-w-[620px] max-h-[85vh] flex flex-col overflow-hidden max-[600px]:max-h-[92vh] max-[600px]:m-1">
            {/* Modal header */}
            <div className="p-6 border-b border-[var(--gray-200)] shrink-0 max-[600px]:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-sora font-bold text-lg">{selectedDemande.client_nom || 'Client anonyme'}</h3>
                <button onClick={() => setSelectedDemande(null)} className="w-8 h-8 rounded-lg bg-[var(--gray-100)] flex items-center justify-center text-[var(--gray-500)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className={`inline-block py-1 px-2.5 rounded-full text-[11px] font-bold ${statusColor(selectedDemande.statut)}`}>{statusLabel(selectedDemande.statut)}</span>
                <span className="inline-block py-1 px-2.5 rounded-full text-[11px] font-bold bg-[var(--gray-100)] text-[var(--gray-500)]">
                  {selectedDemande.type === 'devis' ? 'Demande de devis' : selectedDemande.type === 'message' ? 'Message rapide' : 'Demande'}
                </span>
              </div>
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
                  <a href={`tel:${selectedDemande.client_telephone}`} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--gray-50)] text-sm text-[var(--dark)] no-underline hover:bg-[var(--gray-100)] transition-colors">
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
                <div>Reçue : <strong>{timeAgo(selectedDemande.created_at)}</strong></div>
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
                          {m.content}
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
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendMessage() }}
                  className="flex-1 py-2.5 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)]"
                />
                <button onClick={handleSendMessage} className="bg-[var(--orange)] text-white py-2.5 px-4 rounded-[var(--radius-sm)] font-semibold text-sm border-none cursor-pointer transition-all hover:bg-[var(--orange-dark)]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-4 border-t border-[var(--gray-200)] shrink-0 flex gap-2 justify-end">
              {selectedDemande.statut === 'nouvelle' && (
                <>
                  <button onClick={() => { setRefuseTarget({ id: selectedDemande.id, name: selectedDemande.client_nom || 'Client' }); setSelectedDemande(null) }} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Refuser</button>
                  <button onClick={() => { acceptDemande(selectedDemande.id); setSelectedDemande(null) }} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--green)] text-white border-none cursor-pointer hover:brightness-110 transition-all">Accepter</button>
                </>
              )}
              {(selectedDemande.statut === 'confirmee' || selectedDemande.statut === 'acceptee') && (
                <button onClick={() => { completeDemande(selectedDemande.id); setSelectedDemande(null) }} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[#2E7D32] text-white border-none cursor-pointer hover:brightness-110 transition-all">Marquer comme terminé</button>
              )}
              <button onClick={() => setSelectedDemande(null)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== REFUSE MODAL ===== */}
      {refuseTarget && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setRefuseTarget(null) }}>
          <div className="bg-white rounded-[var(--radius)] w-full max-w-[440px] p-6 max-[600px]:p-5">
            <h3 className="font-sora font-bold text-lg mb-1">Refuser la demande</h3>
            <p className="text-sm text-[var(--gray-500)] mb-5">Indiquez la raison du refus pour <strong>{refuseTarget.name}</strong></p>

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
                placeholder="Précisez la raison..."
                className="w-full py-3 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--orange)] resize-y min-h-[80px] mb-4"
              />
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRefuseTarget(null)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
              <button onClick={confirmRefuse} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--red)] text-white border-none cursor-pointer hover:brightness-110">Confirmer le refus</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

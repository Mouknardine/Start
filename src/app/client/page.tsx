'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import { loadClientDemandes, loadClientAvis, deleteClientDemande, loadMessages, sendMessage, markMessagesRead, deleteClientAccount, signOut, loadAllUnreadCounts } from '@/lib/supabase/helpers'
import type { Demande, Avis, Message } from '@/lib/supabase/helpers'
import { useRealtimeMessages, useRealtimeIncomingMessages } from '@/lib/hooks/useRealtimeMessages'
import { useRealtimeClientDemandes } from '@/lib/hooks/useRealtimeDemandes'

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'Hier'
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { nouvelle: 'En attente', confirmee: 'Confirmée', acceptee: 'Acceptée', refusee: 'Refusée', terminee: 'Terminée' }
  return map[s] || s || 'En attente'
}

function statusColor(s: string): string {
  const map: Record<string, string> = {
    nouvelle: 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]',
    confirmee: 'bg-[var(--green-light)] text-[var(--green)]', acceptee: 'bg-[var(--green-light)] text-[var(--green)]',
    refusee: 'bg-[var(--red-light)] text-[var(--red)]',
    terminee: 'bg-[rgba(46,125,50,0.1)] text-[#2E7D32]',
  }
  return map[s] || 'bg-[var(--gray-100)] text-[var(--gray-500)]'
}

export default function ClientPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'demandes' | 'avis' | 'compte'>('demandes')
  const [email, setEmail] = useState('')
  const [clientPrenom, setClientPrenom] = useState('')
  const [memberSince, setMemberSince] = useState('')

  const [demandes, setDemandes] = useState<Demande[]>([])
  const [avisList, setAvisList] = useState<Avis[]>([])
  const [loadingDem, setLoadingDem] = useState(true)
  const [loadingAvis, setLoadingAvis] = useState(true)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Detail modal
  const [selectedDemande, setSelectedDemande] = useState<Demande | null>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Recharge demandes + avis du client courant (réutilisé pour refresh)
  const refreshAll = useCallback(async (userEmail: string) => {
    if (!userEmail) return
    const supabase = createClient()
    try {
      // 3 requêtes en parallèle au lieu de 2 + N (une par demande)
      const [d, a, counts] = await Promise.all([
        loadClientDemandes(supabase, userEmail),
        loadClientAvis(supabase, userEmail),
        loadAllUnreadCounts(supabase, 'client'),
      ])
      setDemandes(d)
      setAvisList(a)
      setUnreadCounts(counts)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/connexion'); return }
      const userEmail = session.user.email || ''
      setEmail(userEmail)

      const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
      const d = new Date(session.user.created_at)
      setMemberSince(`${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`)

      try {
        const clientData = JSON.parse(localStorage.getItem('artisano-client') || '{}')
        if (clientData?.prenom) setClientPrenom(clientData.prenom)
      } catch { /* ignore */ }

      await refreshAll(userEmail)
      setLoadingDem(false)
      setLoadingAvis(false)
    })
  }, [router, refreshAll])

  // Filet de sécurité : recharger quand l'onglet redevient actif
  // (couvre les cas où Realtime ne pousse pas l'update)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && email) {
        refreshAll(email)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [email, refreshAll])

  async function openDetail(d: Demande) {
    setSelectedDemande(d)
    setChatLoading(true)
    setChatMessages([])
    const supabase = createClient()
    try {
      const msgs = await loadMessages(supabase, d.id)
      setChatMessages(msgs)
      await markMessagesRead(supabase, d.id, 'client')
      setUnreadCounts(prev => { const copy = { ...prev }; delete copy[d.id]; return copy })
    } catch { /* ignore */ }
    setChatLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  // Realtime : nouveaux messages dans la demande ouverte
  const handleRealtimeMessage = useCallback((msg: Message) => {
    setChatMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    // Marquer auto comme lu si c'est le client qui regarde
    if (msg.sender_type === 'artisan' && selectedDemande?.id === msg.demande_id) {
      const supabase = createClient()
      markMessagesRead(supabase, msg.demande_id, 'client').catch(() => {})
    }
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [selectedDemande])
  useRealtimeMessages(selectedDemande?.id, handleRealtimeMessage)

  // Realtime : badges non lus sur les autres demandes
  const handleIncoming = useCallback((msg: Message) => {
    if (selectedDemande?.id === msg.demande_id) return
    setUnreadCounts(prev => ({ ...prev, [msg.demande_id]: (prev[msg.demande_id] || 0) + 1 }))
  }, [selectedDemande])
  useRealtimeIncomingMessages(demandes.map(d => d.id), 'client', handleIncoming)

  // Realtime : changement de statut d'une de mes demandes (acceptée/refusée/terminée)
  const handleDemandeUpdate = useCallback((updated: Demande) => {
    setDemandes(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
    // Si la modale ouverte concerne cette demande, mettre aussi à jour
    setSelectedDemande(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev)
  }, [])
  useRealtimeClientDemandes(email || null, handleDemandeUpdate)

  async function handleSendMessage() {
    if (!chatInput.trim() || !selectedDemande) return
    const text = chatInput.trim()
    setChatInput('')
    const supabase = createClient()
    try {
      // L'email de notification est désormais envoyé côté serveur par /api/messages
      await sendMessage(supabase, selectedDemande.id, 'client', email, text)
      const msgs = await loadMessages(supabase, selectedDemande.id)
      setChatMessages(msgs)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      alert('Erreur envoi: ' + (e instanceof Error ? e.message : ''))
    }
  }

  async function handleDeleteDemande(demandeId: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette demande ?')) return
    const supabase = createClient()
    try {
      await deleteClientDemande(supabase, demandeId, email)
      setDemandes(prev => prev.filter(d => d.id !== demandeId))
    } catch (e) {
      alert('Erreur: ' + (e instanceof Error ? e.message : ''))
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('Voulez-vous vraiment supprimer votre compte ? Cette action est irréversible.')) return
    if (!confirm('Dernière confirmation : toutes vos demandes et avis seront supprimés définitivement.')) return
    // R5 (audit 22/05/2026) : confirmation explicite par mot de passe
    const password = prompt('Pour confirmer la suppression, entrez votre mot de passe :')
    if (!password) return
    const supabase = createClient()
    try {
      await deleteClientAccount(supabase, email, password)
      localStorage.removeItem('artisano-client')
      router.push('/connexion')
    } catch (e) {
      alert('Erreur: ' + (e instanceof Error ? e.message : ''))
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await signOut(supabase)
    router.push('/connexion')
  }

  const artisanNameFor = (d: Demande) => {
    const a = d.artisans
    return a ? (a.entreprise || `${a.prenom || ''} ${a.nom || ''}`.trim() || 'Artisan') : 'Artisan'
  }

  return (
    <div className="min-h-screen bg-[var(--white)]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-10 py-4 flex items-center justify-between bg-[rgba(250,250,248,0.9)] backdrop-blur-[20px] border-b border-black/5 max-[600px]:px-4 max-[600px]:py-3">
        <Logo />
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--gray-500)] max-[600px]:hidden">{email}</span>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-[var(--gray-500)] font-medium hover:text-[var(--dark)] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="max-[600px]:hidden">Déconnexion</span>
          </button>
        </div>
      </nav>

      <div className="max-w-[800px] mx-auto px-10 pt-[100px] pb-20 max-[600px]:px-4 max-[600px]:pt-[80px] max-[600px]:pb-[60px]">
        {/* Header */}
        <h1 className="font-sora text-[28px] font-extrabold mb-2 max-[600px]:text-2xl">
          {clientPrenom ? `Bonjour, ${clientPrenom}` : 'Mon espace'}
        </h1>
        <p className="text-[15px] text-[var(--gray-500)] mb-6 max-[600px]:text-sm">Retrouvez vos demandes et avis</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 max-[600px]:mb-4">
          {(['demandes', 'avis', 'compte'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`py-2.5 px-5 rounded-full text-sm font-semibold transition-all max-[600px]:py-2 max-[600px]:px-4 max-[600px]:text-[13px] ${
              tab === t ? 'bg-[var(--dark)] text-white' : 'bg-[var(--gray-100)] text-[var(--gray-500)] hover:bg-[var(--gray-200)]'
            }`}>
              {t === 'demandes' ? 'Mes demandes' : t === 'avis' ? 'Mes avis' : 'Mon compte'}
            </button>
          ))}
        </div>

        {/* Tab: Demandes */}
        {tab === 'demandes' && (
          <div>
            {!loadingDem && demandes.length > 0 && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => refreshAll(email)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--gray-500)] hover:text-[var(--orange)] transition-colors"
                  title="Rafraîchir"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                  Actualiser
                </button>
              </div>
            )}
            {loadingDem ? (
              <div className="text-center py-12 text-[var(--gray-500)]">Chargement...</div>
            ) : demandes.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📭</div>
                <div className="font-sora font-bold text-lg mb-2">Aucune demande</div>
                <div className="text-sm text-[var(--gray-500)] mb-6">Vous n&apos;avez pas encore envoyé de demande.</div>
                <Link href="/recherche" className="inline-flex bg-[var(--orange)] text-white py-3 px-6 rounded-full font-sora font-bold text-sm hover:bg-[var(--orange-dark)] transition-all">Trouver un artisan</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {demandes.map(d => (
                  <div key={d.id} className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] max-[600px]:p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-bold overflow-hidden" style={{ background: d.artisans?.avatar_url ? undefined : 'linear-gradient(135deg, var(--dark), var(--dark-mid))' }}>
                          {d.artisans?.avatar_url ? (
                            <Image src={d.artisans.avatar_url} alt="" fill sizes="40px" className="object-cover" />
                          ) : (
                            artisanNameFor(d).split(/[\s&]+/).filter(w => w.length > 0).slice(0, 2).map(w => w[0].toUpperCase()).join('')
                          )}
                        </div>
                        <div>
                          <h3 className="font-sora font-bold text-[15px]">{artisanNameFor(d)}</h3>
                          {d.artisans?.metier && <span className="text-xs text-[var(--gray-500)]">{d.artisans.metier}</span>}
                        </div>
                      </div>
                      <span className={`inline-block py-1 px-2.5 rounded-full text-[11px] font-bold ${statusColor(d.statut)}`}>{statusLabel(d.statut)}</span>
                    </div>
                    {/* Message preview */}
                    <div className="text-sm text-[var(--gray-700)] mb-3 leading-relaxed">{(d.message || '(pas de message)').substring(0, 120)}{(d.message?.length || 0) > 120 ? '...' : ''}</div>
                    {/* Meta */}
                    <div className="flex gap-4 text-xs text-[var(--gray-500)] mb-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        {timeAgo(d.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        {d.type === 'devis' ? 'Demande de devis' : d.type === 'message' ? 'Message' : 'Demande'}
                      </span>
                      {d.date_souhaitee && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {d.date_souhaitee}
                        </span>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      <button onClick={() => openDetail(d)} className="text-xs font-semibold py-1.5 px-3 rounded-md bg-[var(--gray-100)] text-[var(--gray-700)] hover:bg-[var(--gray-200)] transition-colors">Voir le détail</button>
                      {unreadCounts[d.id] && (
                        <button onClick={() => openDetail(d)} className="text-xs font-bold py-1.5 px-3 rounded-md bg-[var(--orange)] text-white animate-pulse">
                          {unreadCounts[d.id]} nouveau{unreadCounts[d.id] > 1 ? 'x' : ''}
                        </button>
                      )}
                      {d.statut === 'terminee' && (
                        <Link href={`/avis?artisan=${d.artisan_id}`} className="text-xs font-semibold py-1.5 px-3 rounded-md bg-[rgba(232,112,10,0.1)] text-[var(--orange)] no-underline text-center hover:bg-[rgba(232,112,10,0.15)] transition-colors">Laisser un avis</Link>
                      )}
                      <button onClick={() => handleDeleteDemande(d.id)} className="text-xs font-semibold py-1.5 px-3 rounded-md bg-[var(--red-light)] text-[var(--red)] hover:bg-[rgba(211,47,47,0.12)] transition-colors">Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Avis */}
        {tab === 'avis' && (
          <div>
            {loadingAvis ? (
              <div className="text-center py-12 text-[var(--gray-500)]">Chargement...</div>
            ) : avisList.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">⭐</div>
                <div className="font-sora font-bold text-lg mb-2">Aucun avis</div>
                <div className="text-sm text-[var(--gray-500)]">Vous n&apos;avez pas encore laissé d&apos;avis. Après une intervention, pensez à noter votre artisan !</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {avisList.map(a => {
                  const art = a.artisans
                  const name = art ? (art.entreprise || `${art.prenom || ''} ${art.nom || ''}`.trim() || 'Artisan') : 'Artisan'
                  return (
                    <div key={a.id} className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5 max-[600px]:p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-sora font-bold text-[15px]">{name}</span>
                        <span className="text-[var(--yellow)] text-base">{'★'.repeat(a.note)}{'☆'.repeat(5 - a.note)}</span>
                      </div>
                      {a.commentaire && <div className="text-sm text-[var(--gray-700)] mb-2 leading-relaxed">{a.commentaire}</div>}
                      <div className="text-xs text-[var(--gray-500)]">{timeAgo(a.created_at)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Compte */}
        {tab === 'compte' && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-6 max-[600px]:p-4">
              <h3 className="font-sora font-bold text-base mb-4">Informations du compte</h3>
              {[
                { label: 'Email', value: email },
                { label: 'Membre depuis', value: memberSince },
                { label: 'Demandes envoyées', value: String(demandes.length) },
                { label: 'Avis publiés', value: String(avisList.length) },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b border-[var(--gray-100)] last:border-0">
                  <span className="text-sm text-[var(--gray-500)]">{item.label}</span>
                  <span className="text-sm font-semibold">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-6 max-[600px]:p-4">
              <h3 className="font-sora font-bold text-base mb-2">Mes données personnelles</h3>
              <p className="text-sm text-[var(--gray-500)] mb-4">
                Conformément au RGPD, vous pouvez télécharger toutes vos données stockées sur Artisano au format JSON.
              </p>
              <a
                href="/api/account/export"
                download
                className="inline-block text-sm font-semibold py-2.5 px-5 rounded-full border-2 border-[var(--gray-200)] text-[var(--dark)] no-underline transition-all hover:border-[var(--orange)] hover:text-[var(--orange)]"
              >
                Télécharger mes données
              </a>
            </div>

            <div className="bg-white rounded-[var(--radius)] border border-[var(--red-light)] p-6 max-[600px]:p-4">
              <h3 className="font-sora font-bold text-base mb-2 text-[var(--red)]">Zone de danger</h3>
              <p className="text-sm text-[var(--gray-500)] mb-4">La suppression du compte est irréversible. Toutes vos demandes et avis seront supprimés.</p>
              <button onClick={handleDeleteAccount} className="text-sm font-semibold py-2.5 px-5 rounded-full border-2 border-[var(--red)] text-[var(--red)] transition-all hover:bg-[var(--red)] hover:text-white">
                Supprimer mon compte
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedDemande && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setSelectedDemande(null) }}>
          <div className="bg-white rounded-[var(--radius)] w-full max-w-[560px] max-h-[85vh] flex flex-col overflow-hidden max-[600px]:max-h-[92vh] max-[600px]:m-2">
            {/* Modal header */}
            <div className="p-6 border-b border-[var(--gray-200)] shrink-0 max-[600px]:p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-sora font-bold text-lg">{artisanNameFor(selectedDemande)}</h3>
                <button onClick={() => setSelectedDemande(null)} className="w-8 h-8 rounded-lg bg-[var(--gray-100)] flex items-center justify-center text-[var(--gray-500)] hover:bg-[var(--gray-200)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className={`inline-block py-1 px-2.5 rounded-full text-[11px] font-bold ${statusColor(selectedDemande.statut)}`}>{statusLabel(selectedDemande.statut)}</span>
                <span className="inline-block py-1 px-2.5 rounded-full text-[11px] font-bold bg-[var(--gray-100)] text-[var(--gray-500)]">
                  {selectedDemande.type === 'devis' ? 'Demande de devis' : selectedDemande.type === 'message' ? 'Message' : 'Demande'}
                </span>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6 max-[600px]:p-4">
              {/* Date info */}
              {(selectedDemande.date_souhaitee || selectedDemande.moment_journee) && (
                <div className="mb-4 text-sm text-[var(--gray-700)]">
                  {selectedDemande.date_souhaitee && <div>Date souhaitée : {selectedDemande.date_souhaitee}</div>}
                  {selectedDemande.moment_journee && <div>Moment : {selectedDemande.moment_journee}</div>}
                </div>
              )}
              <div className="text-xs text-[var(--gray-500)] mb-4">Envoyée {timeAgo(selectedDemande.created_at)}</div>

              {/* Message */}
              <div className="bg-[var(--gray-100)] p-4 rounded-[var(--radius-sm)] mb-6 text-sm leading-relaxed">
                {selectedDemande.message || '(pas de message)'}
              </div>

              {/* Chat */}
              <div className="font-sora font-bold text-sm mb-3">Messages</div>
              <div className="bg-[var(--gray-50)] rounded-[var(--radius-sm)] p-4 min-h-[120px] max-h-[280px] overflow-y-auto mb-3">
                {chatLoading ? (
                  <div className="text-center text-[var(--gray-500)] text-sm py-4">Chargement...</div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-center text-[var(--gray-500)] text-sm py-4">Aucun message pour le moment.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {chatMessages.map(m => {
                      const t = new Date(m.created_at)
                      const timeStr = `${t.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })} ${t.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`
                      return (
                        <div key={m.id} className={`max-w-[80%] p-3 rounded-xl text-sm leading-relaxed ${
                          m.sender_type === 'client' ? 'ml-auto bg-[var(--orange)] text-white rounded-br-sm' : 'mr-auto bg-white border border-[var(--gray-200)] rounded-bl-sm'
                        }`}>
                          {m.sender_type === 'artisan' && selectedDemande.artisans && (
                            <div className="text-xs font-bold text-[var(--orange)] mb-1">{artisanNameFor(selectedDemande)}</div>
                          )}
                          {m.content}
                          <div className={`text-[10px] mt-1.5 ${m.sender_type === 'client' ? 'text-white/60' : 'text-[var(--gray-500)]'}`}>{timeStr}</div>
                        </div>
                      )
                    })}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Écrire un message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendMessage() }}
                  className="flex-1 py-2.5 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)]"
                />
                <button onClick={handleSendMessage} className="bg-[var(--orange)] text-white py-2.5 px-4 rounded-[var(--radius-sm)] font-semibold text-sm transition-all hover:bg-[var(--orange-dark)]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-4 border-t border-[var(--gray-200)] shrink-0">
              <button onClick={() => setSelectedDemande(null)} className="w-full py-2.5 rounded-full text-sm font-semibold text-[var(--gray-500)] bg-[var(--gray-100)] hover:bg-[var(--gray-200)] transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

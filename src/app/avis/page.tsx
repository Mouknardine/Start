'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

const LABELS = ['', 'Très insatisfait', 'Insatisfait', 'Correct', 'Satisfait', 'Très satisfait']

function AvisContent() {
  const searchParams = useSearchParams()
  const artisanId = searchParams.get('artisan') || searchParams.get('id')

  const [artisanName, setArtisanName] = useState('Chargement...')
  const [artisanTrade, setArtisanTrade] = useState('')
  const [artisanAvatar, setArtisanAvatar] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [clientNom, setClientNom] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!artisanId) {
      // Effets synchronisateurs : pattern de data fetching standard
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotFound(true); setLoading(false); return
    }
    const supabase = createClient()
    supabase.from('artisans').select('entreprise, prenom, nom, metier, avatar_url').eq('id', artisanId).single().then(({ data, error }) => {
      if (error || !data) { setNotFound(true); setLoading(false); return }
      setArtisanName(data.entreprise || `${data.prenom || ''} ${data.nom || ''}`.trim() || 'Artisan')
      setArtisanTrade(data.metier || '')
      setArtisanAvatar(data.avatar_url || '')
      setLoading(false)
    })
  }, [artisanId])

  async function submitReview() {
    setFeedback(null)
    if (!clientNom.trim()) { setFeedback({ type: 'error', msg: 'Veuillez entrer votre nom.' }); return }
    if (!clientEmail.trim()) { setFeedback({ type: 'error', msg: 'Veuillez entrer votre email pour vérifier votre demande.' }); return }
    if (rating === 0) { setFeedback({ type: 'error', msg: 'Veuillez sélectionner une note (1 à 5 étoiles).' }); return }
    if (!artisanId) { setFeedback({ type: 'error', msg: "Artisan introuvable." }); return }

    setSubmitting(true)
    const supabase = createClient()

    try {
      // Check completed demande
      const { data: hasCompleted, error: checkErr } = await supabase.rpc('check_completed_demande', {
        p_artisan_id: artisanId, p_client_email: clientEmail.trim(),
      })
      if (checkErr) throw checkErr
      if (!hasCompleted) {
        setFeedback({ type: 'error', msg: "Aucune intervention terminée trouvée avec cet email. Vous ne pouvez laisser un avis que si votre demande a été marquée comme terminée par l'artisan." })
        setSubmitting(false)
        return
      }

      const { error } = await supabase.from('avis').insert({
        artisan_id: artisanId, client_nom: clientNom.trim(), client_email: clientEmail.trim(),
        note: rating, commentaire: comment.trim() || null,
      })
      if (error) throw error

      setFeedback({ type: 'success', msg: 'Merci ! Votre avis a été publié avec succès.' })
      setSubmitted(true)
      setTimeout(() => { window.location.href = `/artisan/${artisanId}` }, 2000)
    } catch (e) {
      logger.error('Erreur publication avis:', e)
      setFeedback({ type: 'error', msg: 'Erreur lors de la publication. Veuillez réessayer.' })
    }
    setSubmitting(false)
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--gray-500)]">Chargement...</div>
  if (notFound) return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <h2 className="font-sora text-xl font-bold mb-3">Artisan introuvable</h2>
        <p className="text-[var(--gray-500)] mb-6">Ce lien ne contient pas d&apos;identifiant artisan valide.</p>
        <Link href="/recherche" className="text-[var(--orange)] font-semibold">Rechercher un artisan</Link>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex items-center justify-center p-5 pb-[60px] max-[600px]:p-3 max-[600px]:pb-10">
      <div className="bg-white rounded-[20px] p-12 w-full max-w-[520px] border border-[var(--gray-200)] shadow-[0_4px_24px_rgba(0,0,0,0.04)] max-[600px]:p-6 max-[600px]:max-w-full max-[600px]:rounded-2xl">
        <h1 className="font-sora text-2xl font-extrabold text-center mb-2 max-[600px]:text-xl">Comment s&apos;est passée l&apos;intervention ?</h1>
        <p className="text-center text-[15px] text-[var(--gray-500)] mb-7 leading-snug max-[600px]:text-sm max-[600px]:mb-5">Votre avis aide les autres clients à choisir le bon artisan.</p>

        {/* Artisan block */}
        <div className="flex gap-4 items-center bg-[var(--gray-100)] p-5 rounded-[var(--radius-sm)] mb-8 max-[600px]:p-4 max-[600px]:gap-3 max-[600px]:mb-6">
          <div className="relative w-[60px] h-[60px] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden max-[600px]:w-12 max-[600px]:h-12 max-[600px]:rounded-[14px]" style={{ background: artisanAvatar ? undefined : 'linear-gradient(135deg, var(--dark), var(--dark-mid))' }}>
            {artisanAvatar ? (
              <Image src={artisanAvatar} alt="" fill sizes="60px" className="object-cover" />
            ) : (
              <svg className="w-[26px] h-[26px] text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
            )}
          </div>
          <div>
            <div className="font-sora font-bold text-lg max-[600px]:text-base">{artisanName}</div>
            {artisanTrade && <div className="text-[13px] text-[var(--orange)] font-bold uppercase tracking-wider">{artisanTrade}</div>}
          </div>
        </div>

        {/* Client info */}
        <div className="grid grid-cols-2 gap-3.5 mb-5 max-[600px]:grid-cols-1">
          <div>
            <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Votre nom</label>
            <input type="text" placeholder="Jean Dupont" value={clientNom} onChange={e => setClientNom(e.target.value)} className="w-full py-3 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[600px]:text-base" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Votre email</label>
            <input type="email" placeholder="jean@email.ch" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="w-full py-3 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[600px]:text-base" />
          </div>
        </div>

        {/* Stars */}
        <div className="text-center mb-8 max-[600px]:mb-6">
          <div className="font-sora text-base font-bold mb-4">Votre note</div>
          <div className="flex justify-center gap-2 max-[600px]:gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)} className={`w-[52px] h-[52px] border-2 rounded-[14px] text-2xl flex items-center justify-center cursor-pointer transition-all hover:border-[var(--yellow)] hover:text-[var(--yellow)] hover:scale-110 max-[600px]:w-12 max-[600px]:h-12 max-[600px]:rounded-xl max-[600px]:text-[22px] ${
                n <= rating ? 'border-[var(--yellow)] bg-[rgba(240,180,41,0.08)] text-[var(--yellow)]' : 'border-[var(--gray-200)] text-[var(--gray-300)]'
              }`}>
                ★
              </button>
            ))}
          </div>
          <div className="mt-2.5 text-sm text-[var(--gray-500)] min-h-5">{LABELS[rating] || 'Cliquez sur une étoile pour noter'}</div>
        </div>

        {/* Comment */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Votre commentaire <span className="text-[var(--gray-500)] font-normal">(facultatif)</span></label>
          <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 1000))} placeholder="Racontez comment s'est passée l'intervention : la ponctualité, la qualité du travail, la propreté..." className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] resize-y min-h-[120px] max-[600px]:text-base max-[600px]:min-h-[100px]" />
          <div className="text-xs text-[var(--gray-500)] text-right mt-1">{comment.length} / 1000 caractères</div>
        </div>

        {/* Submit */}
        <button onClick={submitReview} disabled={submitting || submitted} className="w-full bg-[var(--orange)] text-white py-4 rounded-full font-sora font-bold text-base flex items-center justify-center gap-2.5 transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none max-[600px]:min-h-11 max-[600px]:text-[15px] mt-2">
          {submitting ? 'Vérification...' : submitted ? 'Avis publié !' : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Publier mon avis
            </>
          )}
        </button>

        {/* Feedback */}
        {feedback && (
          <div className={`text-center p-4 rounded-[var(--radius-sm)] text-sm font-semibold mt-4 ${feedback.type === 'success' ? 'bg-[var(--green-light)] text-[var(--green)]' : 'bg-[var(--red-light)] text-[var(--red)]'}`}>
            {feedback.msg}
          </div>
        )}

        {/* Verified badge */}
        <div className="flex items-center justify-center gap-2 mt-5 p-3.5 bg-[var(--green-light)] rounded-[var(--radius-sm)] text-[13px] font-semibold text-[var(--green)] max-[600px]:p-3 max-[600px]:text-xs max-[600px]:mt-4">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Seuls les clients ayant une intervention terminée peuvent laisser un avis
        </div>
      </div>
    </div>
  )
}

export default function AvisPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="px-10 py-5 flex items-center justify-center max-[600px]:px-4 max-[600px]:py-3 max-[600px]:justify-between">
        <Logo />
      </nav>
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[var(--gray-500)]">Chargement...</div>}>
        <AvisContent />
      </Suspense>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Bouton de signalement réutilisable.
 * Ouvre une modal avec choix de raison + commentaire libre,
 * envoie à POST /api/signalements.
 */

const RAISONS_AVIS = [
  'Contenu insultant ou haineux',
  'Faux avis / non vérifié',
  'Spam ou publicité',
  'Information personnelle divulguée',
  'Autre',
]

const RAISONS_ARTISAN = [
  'Profil frauduleux',
  'Coordonnées trompeuses',
  'Pratiques commerciales déloyales',
  'Contenu inapproprié',
  'Autre',
]

type Props = {
  cibleType: 'avis' | 'artisan' | 'demande'
  cibleId: string
  size?: 'sm' | 'md'
}

export default function ReportButton({ cibleType, cibleId, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const [raison, setRaison] = useState('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const raisons = cibleType === 'avis' ? RAISONS_AVIS : RAISONS_ARTISAN

  async function handleOpen() {
    // Vérifier auth avant d'ouvrir
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      window.location.href = '/connexion?next=' + encodeURIComponent(window.location.pathname)
      return
    }
    setOpen(true)
    setError('')
    setDone(false)
    setRaison('')
    setDetails('')
  }

  async function handleSubmit() {
    if (!raison) {
      setError('Choisis une raison')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/signalements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cible_type: cibleType,
          cible_id: cibleId,
          raison,
          details: details.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Erreur lors du signalement')
        setSending(false)
        return
      }
      setDone(true)
    } catch {
      setError('Erreur réseau')
    }
    setSending(false)
  }

  const triggerClass = size === 'sm'
    ? 'inline-flex items-center gap-1 text-[11px] text-[var(--gray-500)] hover:text-[var(--red)] transition-colors cursor-pointer'
    : 'inline-flex items-center gap-1.5 text-[13px] text-[var(--gray-500)] hover:text-[var(--red)] transition-colors cursor-pointer font-semibold'

  return (
    <>
      <button onClick={handleOpen} className={triggerClass} type="button">
        <svg className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Signaler
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-[var(--radius)] w-full max-w-[480px] p-6 max-[600px]:p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-sora font-bold text-lg">
                {done ? 'Merci pour votre signalement' : `Signaler ${cibleType === 'avis' ? 'cet avis' : 'ce profil'}`}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-lg bg-[var(--gray-100)] flex items-center justify-center text-[var(--gray-500)] hover:bg-[var(--gray-200)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {done ? (
              <div>
                <p className="text-sm text-[var(--gray-700)] leading-relaxed mb-5">
                  Notre équipe va examiner ce signalement dans les meilleurs délais. Merci de contribuer à la qualité d&apos;Artisano.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full bg-[var(--dark)] text-white py-2.5 rounded-full font-sora font-bold text-sm hover:bg-[var(--orange)] transition-colors"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Raison du signalement</label>
                  <div className="space-y-1.5">
                    {raisons.map((r) => (
                      <label key={r} className="flex items-center gap-2 p-2 rounded-md hover:bg-[var(--gray-50)] cursor-pointer">
                        <input
                          type="radio"
                          name="raison"
                          value={r}
                          checked={raison === r}
                          onChange={() => setRaison(r)}
                          className="accent-[var(--orange)]"
                        />
                        <span className="text-sm">{r}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-semibold text-[var(--dark)] mb-2">
                    Détails (facultatif)
                  </label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Expliquez en quelques mots..."
                    rows={3}
                    maxLength={2000}
                    className="w-full p-3 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] resize-none"
                  />
                </div>

                {error && <p className="text-sm text-[var(--red)] mb-3">{error}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 bg-[var(--gray-100)] text-[var(--dark)] py-2.5 rounded-full font-semibold text-sm hover:bg-[var(--gray-200)] transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={sending || !raison}
                    className="flex-1 bg-[var(--red)] text-white py-2.5 rounded-full font-sora font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

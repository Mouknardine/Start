'use client'

import { useState } from 'react'
import { logger } from '@/lib/logger'

/**
 * Champ de saisie + bouton de vérification IDE-CHE.
 *
 * Utilisé dans l'inscription artisan ET dans /mon-profil pour les artisans
 * déjà inscrits qui veulent valider leur compte.
 *
 * Props :
 *  - initialIde : valeur de départ (édition profil)
 *  - alreadyVerified : true si l'artisan est déjà vérifié
 *  - onVerified(result) : callback quand la vérif passe
 *  - mode : "check" (validation seule) ou "save" (persiste sur le compte)
 */

type VerifyResult = {
  valid: boolean
  ide?: string
  name?: string
  legalSeat?: string
  legalForm?: string
  status?: string
  statusLabel?: string
  cantonalExcerptWeb?: string
  verified?: boolean
  error?: string
}

type Props = {
  initialIde?: string
  alreadyVerified?: boolean
  alreadyCompanyName?: string
  mode?: 'check' | 'save'
  onVerified?: (result: VerifyResult) => void
}

export default function IdeVerification({
  initialIde = '',
  alreadyVerified = false,
  alreadyCompanyName = '',
  mode = 'check',
  onVerified,
}: Props) {
  const [ide, setIde] = useState(initialIde)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(
    alreadyVerified
      ? { valid: true, verified: true, ide: initialIde, name: alreadyCompanyName, statusLabel: 'Vérifié précédemment' }
      : null,
  )

  async function handleCheck() {
    if (!ide.trim()) return
    setChecking(true)
    setResult(null)
    try {
      const res = await fetch('/api/verify-ide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ide: ide.trim(), mode }),
      })
      const data = (await res.json()) as VerifyResult
      setResult(data)
      if (data.verified && onVerified) onVerified(data)
    } catch (e) {
      logger.error('Verify IDE error:', e)
      setResult({ valid: false, error: 'Erreur réseau. Réessayez.' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-semibold text-[var(--dark)] mb-2">
          Numéro IDE de votre entreprise <span className="text-[var(--red)]">*</span>
        </label>
        <div className="flex gap-2 max-[600px]:flex-col">
          <input
            type="text"
            placeholder="CHE-123.456.789"
            value={ide}
            onChange={(e) => setIde(e.target.value)}
            disabled={checking || result?.verified}
            className="flex-1 py-3 px-3.5 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] font-mono tracking-wider outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] disabled:bg-[var(--gray-100)] disabled:cursor-not-allowed"
            aria-describedby="ide-help"
          />
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking || !ide.trim() || result?.verified}
            className="bg-[var(--dark)] text-white py-3 px-6 rounded-[var(--radius-sm)] font-sora font-bold text-sm transition-all hover:bg-[var(--orange)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {checking ? 'Vérification…' : result?.verified ? '✓ Vérifié' : 'Vérifier'}
          </button>
        </div>
        <p id="ide-help" className="text-[12px] text-[var(--gray-500)] mt-1.5 leading-relaxed">
          Vous trouvez votre numéro IDE sur votre extrait du registre du commerce
          (format : <code className="bg-[var(--gray-100)] px-1 rounded">CHE-123.456.789</code>).{' '}
          <a href="https://www.zefix.ch" target="_blank" rel="noopener noreferrer" className="text-[var(--orange)] underline">
            Le chercher sur Zefix
          </a>
        </p>
      </div>

      {/* Résultat de la vérification */}
      {result && !result.verified && result.error && (
        <div className="bg-[var(--red-light)] border border-[var(--red)] rounded-[var(--radius-sm)] p-3 text-sm text-[var(--red)] flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{result.error}</span>
        </div>
      )}

      {result?.verified && (
        <div className="bg-[var(--green-light)] border border-[var(--green)] rounded-[var(--radius-sm)] p-4">
          <div className="flex items-center gap-2 text-[var(--green)] font-semibold text-sm mb-2">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Entreprise vérifiée
          </div>
          {result.name && (
            <dl className="text-[13px] text-[var(--gray-700)] space-y-1.5">
              <div className="flex gap-2">
                <dt className="font-semibold min-w-[100px]">Raison sociale :</dt>
                <dd>{result.name}</dd>
              </div>
              {result.legalForm && (
                <div className="flex gap-2">
                  <dt className="font-semibold min-w-[100px]">Forme :</dt>
                  <dd>{result.legalForm}</dd>
                </div>
              )}
              {result.legalSeat && (
                <div className="flex gap-2">
                  <dt className="font-semibold min-w-[100px]">Siège :</dt>
                  <dd>{result.legalSeat}</dd>
                </div>
              )}
              {result.statusLabel && (
                <div className="flex gap-2">
                  <dt className="font-semibold min-w-[100px]">Statut :</dt>
                  <dd>{result.statusLabel}</dd>
                </div>
              )}
              {result.cantonalExcerptWeb && (
                <div className="flex gap-2 pt-1.5">
                  <a
                    href={result.cantonalExcerptWeb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--orange)] text-[12px] underline"
                  >
                    Voir l&apos;extrait officiel du registre →
                  </a>
                </div>
              )}
            </dl>
          )}
        </div>
      )}

      {result && result.valid === false && !result.error && (
        <div className="bg-[var(--gray-100)] rounded-[var(--radius-sm)] p-3 text-sm text-[var(--gray-700)]">
          IDE non vérifiable. Si vous êtes en raison individuelle non inscrite au RC,
          vous pourrez compléter votre profil avec une attestation cantonale (validation manuelle).
        </div>
      )}
    </div>
  )
}

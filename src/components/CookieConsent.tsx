'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

/**
 * Bannière de consentement cookies / traceurs.
 *
 * Conforme aux exigences RGPD (information préalable, choix granulaire,
 * refus aussi simple qu'accepter). Ne dépose AUCUN traceur tant que
 * l'utilisateur n'a pas choisi.
 *
 * 3 catégories :
 *  - "necessary" : toujours actif (auth Supabase, session, anti-csrf)
 *  - "analytics" : Plausible/Umami (à activer plus tard avec point #I9)
 *  - "marketing" : aucun pour l'instant — réservé pour futur
 *
 * Le choix est stocké dans localStorage avec une version pour pouvoir
 * forcer un re-consentement si la politique change.
 */

const STORAGE_KEY = 'artisano-cookie-consent'
const POLICY_VERSION = 1

type Consent = {
  version: number
  necessary: true
  analytics: boolean
  marketing: boolean
  timestamp: string
}

export function getStoredConsent(): Consent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Consent
    if (parsed.version !== POLICY_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function saveConsent(analytics: boolean, marketing: boolean) {
  const consent: Consent = {
    version: POLICY_VERSION,
    necessary: true,
    analytics,
    marketing,
    timestamp: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
  // Notifie l'app pour activer/désactiver les scripts conditionnels
  window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: consent }))
}

export default function CookieConsent() {
  const [show, setShow] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    // Affiche la bannière uniquement si pas de choix valide enregistré
    const existing = getStoredConsent()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!existing) setShow(true)
  }, [])

  if (!show) return null

  function acceptAll() {
    saveConsent(true, true)
    setShow(false)
  }

  function rejectAll() {
    saveConsent(false, false)
    setShow(false)
  }

  function saveCustom() {
    saveConsent(analytics, marketing)
    setShow(false)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-desc"
      className="fixed bottom-0 left-0 right-0 z-[200] p-4 max-[600px]:p-3"
    >
      <div className="max-w-[640px] mx-auto bg-white border border-[var(--gray-200)] rounded-[var(--radius)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-5 max-[600px]:p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="text-2xl shrink-0" aria-hidden="true">🍪</div>
          <div>
            <h2 id="cookie-title" className="font-sora font-bold text-base text-[var(--dark)] mb-1">
              Vos préférences cookies
            </h2>
            <p id="cookie-desc" className="text-[13px] text-[var(--gray-700)] leading-relaxed">
              Nous utilisons des cookies essentiels au fonctionnement du site.
              Avec votre accord, nous utilisons aussi des cookies pour mesurer l&apos;audience et améliorer l&apos;expérience.
              {' '}
              <Link href="/confidentialite" className="text-[var(--orange)] underline">En savoir plus</Link>
            </p>
          </div>
        </div>

        {showDetails && (
          <div className="bg-[var(--gray-50)] rounded-[var(--radius-sm)] p-3 mb-3 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-[13px] text-[var(--dark)]">Strictement nécessaires</div>
                <p className="text-[12px] text-[var(--gray-500)] leading-relaxed">Authentification, session, sécurité. Toujours actifs.</p>
              </div>
              <span className="text-[11px] font-bold text-[var(--green)] uppercase tracking-wider shrink-0">Toujours actifs</span>
            </div>
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <div className="font-semibold text-[13px] text-[var(--dark)]">Mesure d&apos;audience</div>
                <p className="text-[12px] text-[var(--gray-500)] leading-relaxed">Statistiques anonymes pour comprendre l&apos;usage du site.</p>
              </div>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[var(--orange)] cursor-pointer shrink-0"
              />
            </label>
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <div className="font-semibold text-[13px] text-[var(--dark)]">Marketing</div>
                <p className="text-[12px] text-[var(--gray-500)] leading-relaxed">Personnalisation et publicité ciblée. Aucun actif aujourd&apos;hui.</p>
              </div>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[var(--orange)] cursor-pointer shrink-0"
              />
            </label>
          </div>
        )}

        <div className="flex gap-2 flex-wrap max-[500px]:flex-col">
          <button
            onClick={acceptAll}
            className="bg-[var(--orange)] text-white py-2.5 px-5 rounded-full font-sora font-bold text-[13px] cursor-pointer transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-px flex-1 max-[500px]:w-full"
          >
            Tout accepter
          </button>
          <button
            onClick={rejectAll}
            className="bg-[var(--gray-100)] text-[var(--dark)] py-2.5 px-5 rounded-full font-semibold text-[13px] cursor-pointer transition-all hover:bg-[var(--gray-200)] flex-1 max-[500px]:w-full"
          >
            Tout refuser
          </button>
          <button
            onClick={() => showDetails ? saveCustom() : setShowDetails(true)}
            className="bg-white text-[var(--gray-700)] py-2.5 px-5 rounded-full font-semibold text-[13px] cursor-pointer transition-all hover:text-[var(--dark)] border border-[var(--gray-200)] flex-1 max-[500px]:w-full"
          >
            {showDetails ? 'Enregistrer mon choix' : 'Personnaliser'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { getStoredConsent } from '@/components/CookieConsent'

/**
 * Charge Plausible Analytics uniquement si :
 *  - le domaine est configuré via NEXT_PUBLIC_PLAUSIBLE_DOMAIN
 *  - l'utilisateur a accepté les cookies analytics (RGPD)
 *
 * Plausible est privacy-friendly : pas de cookies, pas de tracking
 * cross-site, conforme RGPD sans bannière obligatoire. Mais on respecte
 * quand même le choix utilisateur pour être propre.
 */
export default function Analytics() {
  const [consented, setConsented] = useState(false)
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN

  useEffect(() => {
    const c = getStoredConsent()
    // Lecture du consentement stocké (localStorage) : uniquement côté client,
    // d'où l'initialisation dans l'effet plutôt que dans useState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsented(!!c?.analytics)

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { analytics?: boolean }
      setConsented(!!detail?.analytics)
    }
    window.addEventListener('cookie-consent-changed', handler)
    return () => window.removeEventListener('cookie-consent-changed', handler)
  }, [])

  if (!domain || !consented) return null

  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  )
}

/**
 * Constantes du site — source unique pour l'URL publique, le nom et les
 * libellés de couverture géographique.
 *
 * Passer d'un lancement régional à national = changer COVERAGE_LABEL ici.
 */

const FALLBACK_SITE_URL = 'https://artisano.ch'

/**
 * URL publique du site, sans slash final.
 * Priorité : NEXT_PUBLIC_SITE_URL → URL de production Vercel → artisano.ch.
 * Côté navigateur, préférer window.location.origin quand c'est possible.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : ''
  return (fromEnv || fromVercel || FALLBACK_SITE_URL).replace(/\/$/, '')
}

export const SITE_NAME = 'Artisano'
export const SITE_TAGLINE = 'Trouve ton artisan en 2 clics'
export const CONTACT_EMAIL = 'contact@artisano.ch'

/** Zone couverte, telle qu'affichée aux utilisateurs (« Suisse romande », « Suisse »…). */
export const COVERAGE_LABEL = 'Suisse romande'
/** Badge de la page d'accueil. */
export const COVERAGE_BADGE = `Disponible dans toute la ${COVERAGE_LABEL}`
/** Libellé par défaut quand aucune ville n'est renseignée. */
export const DEFAULT_ZONE_LABEL = COVERAGE_LABEL

export const SITE_DESCRIPTION =
  `Trouve un plombier, électricien ou serrurier près de chez toi en ${COVERAGE_LABEL}. ` +
  'Des vrais avis, des vrais pros, zéro prise de tête.'
export const SITE_DESCRIPTION_SHORT =
  `Trouve un plombier, électricien ou serrurier près de chez toi en ${COVERAGE_LABEL}.`

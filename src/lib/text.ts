/**
 * Normalisation de texte pour la recherche : minuscules, sans accents,
 * séparateurs (espaces, tirets, apostrophes, points) réduits à un espace.
 *
 * Miroir exact de public.norm_text() (migration 0014). Toute évolution doit
 * être reportée des deux côtés.
 *
 *   normalizeText('Yverdon-les-Bains') → 'yverdon les bains'
 *   normalizeText('Épalinges')         → 'epalinges'
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[\s\-'’.]+/g, ' ')
    .trim()
}

/** Première lettre en majuscule, reste inchangé. */
export function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

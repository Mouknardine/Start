/**
 * Chemin de retour (`?next=`) sûr : uniquement un chemin interne.
 *
 * Refuse « https://evil.com », « //evil.com » et « /\evil.com » : le
 * navigateur et new URL(next, origin) traitent « \ » comme « / », donc ces
 * deux dernières formes partent sur un autre domaine.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  // Caractères de contrôle (tab, retour ligne) ignorés par les parseurs d'URL
  if (/[\u0000-\u001f]/.test(next)) return fallback
  return next
}

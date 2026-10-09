// ============================================================================
// document-link.ts — liens de partage des devis / factures (serveur uniquement)
// ============================================================================
// Le client reçoit un lien /f/<id>.<signature> : il consulte le document,
// le télécharge, paie avec la QR-facture ou accepte le devis, sans compte.
// La signature HMAC rend le lien impossible à deviner ; aucune donnée en DB.
// Clé : DOCUMENT_LINK_SECRET, ou à défaut la clé service Supabase (jamais
// exposée : seule une empreinte tronquée sort du serveur).
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cle(): string | null {
  return process.env.DOCUMENT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null
}

function signature(id: string, k: string): string {
  // 22 caractères base64url ≈ 132 bits
  return createHmac('sha256', k).update(`document:${id.toLowerCase()}`).digest('base64url').slice(0, 22)
}

/** Jeton de partage d'un document, ou null si aucune clé n'est configurée. */
export function signerLienDocument(id: string): string | null {
  const k = cle()
  if (!k || !UUID.test(id)) return null
  return `${id}.${signature(id, k)}`
}

/** Identifiant du document si le jeton est authentique, sinon null. */
export function verifierLienDocument(token: string): string | null {
  const k = cle()
  if (!k) return null
  const [id, sig] = token.split('.')
  if (!id || !sig || !UUID.test(id)) return null
  const attendu = signature(id, k)
  if (sig.length !== attendu.length) return null
  return timingSafeEqual(Buffer.from(sig), Buffer.from(attendu)) ? id : null
}

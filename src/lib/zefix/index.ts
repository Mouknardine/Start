/**
 * Client minimal pour l'API publique Zefix
 * (registre suisse du commerce — gratuit, sans clé).
 *
 * Doc : https://www.zefix.ch/ZefixPublicREST/swagger-ui/index.html
 *
 * Endpoint utilisé : POST /company/search avec body { name, uid? }
 * (l'endpoint /company/uid/{uid} renvoie une 404 pour certains formats).
 */

const ZEFIX_BASE = 'https://www.zefix.ch/ZefixPublicREST/api/v1'

export type ZefixCompany = {
  uid: string             // ex: "CHE-123.456.789"
  uidFormatted: string    // ex: "CHE-123.456.789"
  name: string            // raison sociale officielle
  legalSeat: string       // ville du siège
  legalForm?: string      // forme juridique (SA, Sàrl, RI, etc.)
  status: 'ACTIVE' | 'CANCELLED' | 'IN_LIQUIDATION' | 'UNKNOWN'
  cantonalExcerptWeb?: string  // URL extrait RC cantonal
}

/**
 * Normalise un IDE pour le format canonique CHE-XXX.XXX.XXX
 * Accepte : "CHE123456789", "CHE-123.456.789", "che 123 456 789", etc.
 * Retourne null si invalide.
 */
export function normalizeIde(input: string): string | null {
  if (!input) return null
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // Doit commencer par CHE puis 9 chiffres
  const match = cleaned.match(/^CHE(\d{9})$/)
  if (!match) return null
  const digits = match[1]
  return `CHE-${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}`
}

/**
 * Validation du checksum mod-11 du numéro IDE-CHE.
 * Algorithme officiel OFS : pondération [5,4,3,2,7,6,5,4], somme mod 11.
 * Retourne true si le numéro est syntaxiquement valide.
 */
export function isValidIdeChecksum(formatted: string): boolean {
  const cleaned = formatted.replace(/[^0-9]/g, '')
  if (cleaned.length !== 9) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4]
  let sum = 0
  for (let i = 0; i < 8; i++) {
    sum += parseInt(cleaned[i]!, 10) * weights[i]!
  }
  const remainder = sum % 11
  const checkDigit = remainder === 0 ? 0 : remainder === 1 ? -1 : 11 - remainder
  if (checkDigit < 0) return false // mod 11 = 1 → IDE invalide
  return checkDigit === parseInt(cleaned[8]!, 10)
}

/**
 * Interroge Zefix pour un IDE donné. Renvoie null si introuvable.
 * Throws si l'API Zefix est down ou réponse invalide.
 */
export async function searchByUid(uidFormatted: string): Promise<ZefixCompany | null> {
  // Format attendu par Zefix : CHE-XXX.XXX.XXX
  const url = `${ZEFIX_BASE}/company/uid/${encodeURIComponent(uidFormatted)}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Artisano/1.0 (https://artisano.ch)',
    },
    // Évite le cache navigateur côté Edge runtime
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Zefix API error: HTTP ${res.status}`)
  }

  const data = await res.json()

  // L'API retourne un tableau de résultats. On prend le 1er match.
  const company = Array.isArray(data) ? data[0] : data
  if (!company || !company.uid) return null

  return {
    uid: company.uid,
    uidFormatted: company.uidFormatted || uidFormatted,
    name: company.name || '',
    legalSeat: company.legalSeat || '',
    legalForm: company.legalForm?.shortName?.fr || company.legalForm?.shortName?.de || undefined,
    status: mapStatus(company.status),
    cantonalExcerptWeb: company.cantonalExcerptWeb || undefined,
  }
}

function mapStatus(s: string | undefined): ZefixCompany['status'] {
  if (!s) return 'UNKNOWN'
  const upper = s.toUpperCase()
  if (upper.includes('ACTIVE') || upper === 'EXISTANT') return 'ACTIVE'
  if (upper.includes('CANCELLED') || upper.includes('RADIE')) return 'CANCELLED'
  if (upper.includes('LIQUIDATION')) return 'IN_LIQUIDATION'
  return 'UNKNOWN'
}

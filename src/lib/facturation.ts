// ============================================================================
// facturation.ts — logique pure des devis / factures (calculs, statuts, liste)
// ============================================================================
// Aucune dépendance React / Supabase : testé dans tests/unit/facturation.test.ts.
// ============================================================================

export type DocType = 'devis' | 'facture'

/** Pré-remplissage d'un devis depuis une demande client. */
export type DevisPrefill = {
  client_nom: string
  client_email: string
  client_telephone: string
  client_adresse: string
  description: string
}

/** Sous-ensemble d'un document utile aux calculs de liste. */
export type DocResume = {
  id: string
  type: DocType
  statut: string
  total_ttc: number
  date_emission: string
  date_echeance: string | null
  date_paiement: string | null
  client_nom: string
  client_email?: string | null
  client_telephone?: string | null
  client_adresse?: string | null
  created_at: string
}

// ===== Nombres & dates =====

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Lit un nombre saisi au clavier suisse : virgule ou point décimal,
 * apostrophes / espaces de milliers. Vide ou invalide → 0, jamais négatif.
 */
export function parseDecimal(raw: string): number {
  const s = raw.replace(/['’\s]/g, '').replace(',', '.')
  const n = parseFloat(s)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** Valeur affichée dans un champ numérique : « 1.5 », « 95 », « 12.25 ». */
export function formatDecimalInput(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(round2(n))
}

export function formatCHF(n: number): string {
  const fixed = Math.abs(n).toFixed(2)
  const [int, dec] = fixed.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${n < 0 ? '-' : ''}${formatted}.${dec} CHF`
}

/** « 2026-10-09 » → « 09.10.2026 ». */
export function formatDateCH(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

/** Date du jour au format AAAA-MM-JJ, en heure locale (pas UTC). */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Ajoute des jours à une date AAAA-MM-JJ (calcul local, sans décalage horaire). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + days))
}

// ===== Calculs =====

export type Remise = 'aucune' | 'pourcentage' | 'montant'

export type Totaux = {
  sousTotal: number
  montantRemise: number
  montantTva: number
  totalTtc: number
}

export function totalLigne(quantite: number, prixUnitaire: number): number {
  return round2(quantite * prixUnitaire)
}

export function calculerTotaux(
  lignes: { quantite: number; prix_unitaire: number }[],
  remiseType: Remise,
  remiseValeur: number,
  tauxTva: number,
): Totaux {
  const sousTotal = round2(lignes.reduce((s, l) => s + totalLigne(l.quantite, l.prix_unitaire), 0))
  const montantRemise = remiseType === 'pourcentage'
    ? round2(sousTotal * Math.min(Math.max(remiseValeur, 0), 100) / 100)
    : remiseType === 'montant'
      ? round2(Math.min(Math.max(remiseValeur, 0), sousTotal))
      : 0
  const base = round2(sousTotal - montantRemise)
  const montantTva = round2(base * tauxTva / 100)
  return { sousTotal, montantRemise, montantTva, totalTtc: round2(base + montantTva) }
}

// ===== Statuts =====

const LIBELLES: Record<string, string> = {
  brouillon: 'Brouillon', envoye: 'Envoyé', envoyee: 'Envoyée',
  accepte: 'Accepté', refuse: 'Refusé', payee: 'Payée',
  en_retard: 'En retard', converti: 'Facturé',
}

export function libelleStatutDoc(statut: string): string {
  return LIBELLES[statut] || 'Brouillon'
}

/** Facture envoyée dont l'échéance est dépassée, ou marquée en retard. */
export function estEnRetard(doc: Pick<DocResume, 'type' | 'statut' | 'date_echeance'>, today: string): boolean {
  if (doc.type !== 'facture') return false
  if (doc.statut === 'en_retard') return true
  return doc.statut === 'envoyee' && !!doc.date_echeance && doc.date_echeance.slice(0, 10) < today
}

export type GroupeDoc = 'a_traiter' | 'brouillons' | 'en_attente' | 'clotures'

export const GROUPES_DOC: { key: GroupeDoc; label: string }[] = [
  { key: 'a_traiter', label: 'À traiter' },
  { key: 'brouillons', label: 'Brouillons' },
  { key: 'en_attente', label: 'En attente du client' },
  { key: 'clotures', label: 'Terminés' },
]

export type Ton = 'neutre' | 'info' | 'succes' | 'alerte' | 'action'

export type EtatDoc = { groupe: GroupeDoc; libelle: string; ton: Ton }

/** Où ranger un document dans la liste et quel badge lui donner. */
export function etatDocument(doc: Pick<DocResume, 'type' | 'statut' | 'date_echeance'>, today: string): EtatDoc {
  if (doc.statut === 'brouillon' || !doc.statut) return { groupe: 'brouillons', libelle: 'Brouillon', ton: 'neutre' }
  if (doc.type === 'devis') {
    if (doc.statut === 'envoye') return { groupe: 'en_attente', libelle: 'Envoyé', ton: 'info' }
    if (doc.statut === 'accepte') return { groupe: 'a_traiter', libelle: 'À facturer', ton: 'action' }
    if (doc.statut === 'refuse') return { groupe: 'clotures', libelle: 'Refusé', ton: 'alerte' }
    return { groupe: 'clotures', libelle: 'Facturé', ton: 'succes' }
  }
  if (doc.statut === 'payee') return { groupe: 'clotures', libelle: 'Payée', ton: 'succes' }
  if (estEnRetard(doc, today)) return { groupe: 'a_traiter', libelle: 'En retard', ton: 'alerte' }
  return { groupe: 'en_attente', libelle: 'Envoyée', ton: 'info' }
}

export type Etape = { label: string; etat: 'fait' | 'actuel' | 'a_venir'; alerte?: boolean }

/** Frise d'avancement affichée en tête de l'éditeur. */
export function etapesDocument(type: DocType, statut: string, enRetard = false): Etape[] {
  const etats = (actuel: number, total: number) =>
    Array.from({ length: total }, (_, i) => (i < actuel ? 'fait' : i === actuel ? 'actuel' : 'a_venir') as Etape['etat'])
  if (type === 'devis') {
    const labels = ['Brouillon', 'Envoyé', 'Accepté', 'Facturé']
    const idx = { brouillon: 0, envoye: 1, accepte: 2, refuse: 2, converti: 4 }[statut] ?? 0
    return labels.map((label, i) => {
      if (statut === 'refuse' && i === 2) return { label: 'Refusé', etat: 'actuel', alerte: true }
      return { label, etat: etats(idx, labels.length)[i] }
    })
  }
  const labels = ['Brouillon', 'Envoyée', 'Payée']
  const idx = { brouillon: 0, envoyee: 1, en_retard: 1, payee: 3 }[statut] ?? 0
  return labels.map((label, i) => {
    if (i === 1 && idx === 1 && enRetard) return { label: 'En retard', etat: 'actuel', alerte: true }
    return { label, etat: etats(idx, labels.length)[i] }
  })
}

// ===== Tableau de bord =====

export type ResumeFacturation = {
  aEncaisser: number
  nbAEncaisser: number
  nbEnRetard: number
  devisEnAttente: number
  nbDevisEnAttente: number
  encaisseMois: number
}

export function resumeFacturation(docs: DocResume[], today: string): ResumeFacturation {
  const mois = today.slice(0, 7)
  const r: ResumeFacturation = { aEncaisser: 0, nbAEncaisser: 0, nbEnRetard: 0, devisEnAttente: 0, nbDevisEnAttente: 0, encaisseMois: 0 }
  for (const d of docs) {
    const total = Number(d.total_ttc) || 0
    if (d.type === 'facture' && (d.statut === 'envoyee' || d.statut === 'en_retard')) {
      r.aEncaisser += total
      r.nbAEncaisser++
      if (estEnRetard(d, today)) r.nbEnRetard++
    } else if (d.type === 'devis' && d.statut === 'envoye') {
      r.devisEnAttente += total
      r.nbDevisEnAttente++
    } else if (d.type === 'facture' && d.statut === 'payee' && (d.date_paiement || d.date_emission || '').slice(0, 7) === mois) {
      r.encaisseMois += total
    }
  }
  r.aEncaisser = round2(r.aEncaisser)
  r.devisEnAttente = round2(r.devisEnAttente)
  r.encaisseMois = round2(r.encaisseMois)
  return r
}

export type ClientConnu = { nom: string; email: string; telephone: string; adresse: string }

/** Clients déjà facturés, du plus récent au plus ancien, sans doublon de nom. */
export function clientsRecents(docs: DocResume[], limit = 6): ClientConnu[] {
  const vus = new Set<string>()
  const out: ClientConnu[] = []
  const tries = [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const d of tries) {
    const nom = (d.client_nom || '').trim()
    const cle = nom.toLowerCase()
    if (!nom || vus.has(cle)) continue
    vus.add(cle)
    out.push({ nom, email: d.client_email || '', telephone: d.client_telephone || '', adresse: d.client_adresse || '' })
    if (out.length >= limit) break
  }
  return out
}

export function emailValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

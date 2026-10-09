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
  /** Écart d'arrondi aux 5 centimes (usage suisse), en général entre −0.02 et +0.02 */
  arrondi: number
  totalTtc: number
}

export function totalLigne(quantite: number, prixUnitaire: number): number {
  return round2(quantite * prixUnitaire)
}

/** Arrondi aux 5 centimes, comme les totaux des factures suisses. */
export function arrondi5(n: number): number {
  return round2(Math.round((n + Number.EPSILON) * 20) / 20)
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
  const brut = round2(base + montantTva)
  const totalTtc = arrondi5(brut)
  return { sousTotal, montantRemise, montantTva, arrondi: round2(totalTtc - brut), totalTtc }
}

/** Prix de vente du matériel : prix d'achat + marge, arrondi aux 5 centimes. */
export function prixDepuisAchat(prixAchat: number, margePct: number): number {
  return arrondi5(Math.max(prixAchat, 0) * (1 + Math.max(margePct, 0) / 100))
}

// ===== Lignes : catégories, unités, durées =====

export type Categorie = 'main_oeuvre' | 'materiel' | 'deplacement' | 'forfait'

export const CATEGORIES: { key: Categorie; label: string; titre: string }[] = [
  { key: 'main_oeuvre', label: 'Main d’œuvre', titre: 'Main d’œuvre' },
  { key: 'materiel', label: 'Matériel', titre: 'Fournitures et matériel' },
  { key: 'deplacement', label: 'Déplacement', titre: 'Déplacements' },
  { key: 'forfait', label: 'Forfait', titre: 'Prestations' },
]

/** Catégorie d'une ligne ; les anciennes lignes sans catégorie sont déduites de l'unité. */
export function categorieLigne(l: { categorie?: unknown; unite?: string }): Categorie {
  if (CATEGORIES.some(c => c.key === l.categorie)) return l.categorie as Categorie
  return l.unite === 'heure' ? 'main_oeuvre' : 'forfait'
}

export const UNITES: { value: string; court: string; long: string }[] = [
  { value: 'unite', court: 'pce', long: 'pièce' },
  { value: 'm', court: 'm', long: 'mètre' },
  { value: 'ml', court: 'ml', long: 'mètre linéaire' },
  { value: 'm2', court: 'm²', long: 'm²' },
  { value: 'm3', court: 'm³', long: 'm³' },
  { value: 'kg', court: 'kg', long: 'kilo' },
  { value: 'l', court: 'l', long: 'litre' },
  { value: 'lot', court: 'lot', long: 'lot' },
  { value: 'forfait', court: 'forfait', long: 'forfait' },
  { value: 'heure', court: 'h', long: 'heure' },
]

export function uniteCourte(u: string): string {
  return UNITES.find(x => x.value === u)?.court || u
}

export function uniteLongue(u: string): string {
  return UNITES.find(x => x.value === u)?.long || u
}

/** « 1.5 » → « 1.5 », « 2 » → « 2 » (au plus deux décimales, sans zéros inutiles). */
export function formatNombre(n: number): string {
  return String(round2(n))
}

/**
 * Durée tapée par un artisan → heures décimales.
 * Accepte « 1h30 », « 1 h 30 », « 1:30 », « 1,5 », « 1.5 h », « 90 min ». Sinon null.
 */
export function parseDuree(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let m = s.match(/^(\d+)(?:h|:)(\d{1,2})?(?:min|mn|m)?$/)
  if (m) return +m[1] + (m[2] ? +m[2] / 60 : 0)
  m = s.match(/^(\d+)(?:min|mn|m)$/)
  if (m) return +m[1] / 60
  m = s.match(/^(\d+(?:[.,]\d+)?)h?$/)
  if (m) return parseFloat(m[1].replace(',', '.'))
  return null
}

/** Heures décimales → « 30 min », « 1 h », « 1 h 30 ». */
export function formatDuree(heures: number): string {
  const total = Math.max(0, Math.round(heures * 60))
  const h = Math.floor(total / 60)
  const min = total % 60
  if (h === 0) return `${min} min`
  if (min === 0) return `${h} h`
  return `${h} h ${String(min).padStart(2, '0')}`
}

/** Quantité affichée dans une ligne : « 4 h 30 », « 3 pce », « forfait ». */
export function quantiteLisible(quantite: number, unite: string): string {
  if (unite === 'heure') return formatDuree(quantite)
  if (unite === 'forfait' && quantite === 1) return 'forfait'
  return `${formatNombre(quantite)} ${uniteCourte(unite)}`
}

/** Détail sous la désignation : « 2 personnes × 4 h » pour une équipe. */
export function detailLigne(l: { categorie?: unknown; unite?: string; heures?: unknown; personnes?: unknown }): string {
  const personnes = Number(l.personnes) || 1
  const heures = Number(l.heures) || 0
  if (categorieLigne(l) === 'main_oeuvre' && personnes > 1 && heures > 0) {
    return `${personnes} personnes × ${formatDuree(heures)}`
  }
  return ''
}

/** Prix court à la suisse : « 95.– » pour un montant rond, sinon « 14.80 ». */
export function formatPrixCourt(n: number): string {
  const r = round2(n)
  return Number.isInteger(r) ? `${r}.–` : r.toFixed(2)
}

/** Résumé d'une ligne : « 2 pers. × 4 h × 95.–/h », « 2 pce × 14.80 ». */
export function resumeLigne(l: { categorie?: unknown; unite: string; quantite: number; prix_unitaire: number; heures?: number; personnes?: number }): string {
  const prix = formatPrixCourt(l.prix_unitaire)
  if (categorieLigne(l) === 'main_oeuvre' && l.unite === 'heure') {
    const personnes = l.personnes ?? 1
    const heures = l.heures ?? l.quantite / personnes
    return `${personnes > 1 ? `${personnes} pers. × ` : ''}${formatDuree(heures)} × ${prix}/h`
  }
  return `${quantiteLisible(l.quantite, l.unite)} × ${prix}`
}

/** Regroupe les lignes par catégorie, dans l'ordre main d'œuvre → matériel → déplacement → forfait. */
export function regrouperLignes<T extends { categorie?: unknown; unite?: string }>(lignes: T[]): { categorie: Categorie; titre: string; lignes: T[] }[] {
  return CATEGORIES
    .map(c => ({ categorie: c.key, titre: c.titre, lignes: lignes.filter(l => categorieLigne(l) === c.key) }))
    .filter(g => g.lignes.length > 0)
}

// ===== Réglages de facturation (table agenda_data, clé ci-dessous) =====

export const CLE_REGLAGES = 'facturation_reglages'

export type ReglagesFacturation = {
  /** CHF HT par heure ; 0 = pas encore renseigné */
  tarif_horaire: number
  /** CHF HT par déplacement ; 0 = pas de forfait */
  tarif_deplacement: number
  /** % ajouté au prix d'achat du matériel */
  marge_materiel: number
  assujetti_tva: boolean
  numero_tva: string
  taux_tva: number
  /** jours */
  delai_paiement: number
  /** jours */
  validite_devis: number
  /** texte ajouté aux notes des nouveaux documents */
  conditions: string
}

export const REGLAGES_DEFAUT: ReglagesFacturation = {
  tarif_horaire: 0,
  tarif_deplacement: 0,
  marge_materiel: 20,
  assujetti_tva: true,
  numero_tva: '',
  taux_tva: 8.1,
  delai_paiement: 30,
  validite_devis: 30,
  conditions: '',
}

export function normaliserReglages(raw: unknown): ReglagesFacturation {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, def: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : def
  }
  const d = REGLAGES_DEFAUT
  return {
    tarif_horaire: num(r.tarif_horaire, d.tarif_horaire, 100000),
    tarif_deplacement: num(r.tarif_deplacement, d.tarif_deplacement, 100000),
    marge_materiel: num(r.marge_materiel, d.marge_materiel, 1000),
    assujetti_tva: typeof r.assujetti_tva === 'boolean' ? r.assujetti_tva : d.assujetti_tva,
    numero_tva: typeof r.numero_tva === 'string' ? r.numero_tva.slice(0, 40) : d.numero_tva,
    taux_tva: num(r.taux_tva, d.taux_tva, 100),
    delai_paiement: Math.round(num(r.delai_paiement, d.delai_paiement, 365)),
    validite_devis: Math.round(num(r.validite_devis, d.validite_devis, 365)),
    conditions: typeof r.conditions === 'string' ? r.conditions.slice(0, 1000) : d.conditions,
  }
}

/** « che123456789 » → « CHE-123.456.789 TVA » ; laissé tel quel si ce n'est pas un IDE. */
export function formatNumeroTva(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 9) return raw.trim()
  return `CHE-${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)} TVA`
}

// ===== Textes du document =====

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « 2026-10-09 » → « 9 octobre 2026 ». */
export function dateLongue(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MOIS[m - 1]} ${y}`
}

/** Localité d'une adresse suisse (« Rue du Lac 15, 1003 Lausanne » → « Lausanne »). */
export function localiteDepuisAdresse(adresse: string | null | undefined): string {
  const m = (adresse || '').match(/\b\d{4}\s+([A-Za-zÀ-ÿ'’.\- ]+)/)
  return m ? m[1].trim().replace(/[,;]+$/, '').trim() : ''
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

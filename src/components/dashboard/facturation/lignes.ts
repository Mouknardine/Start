import { categorieLigne, totalLigne, type Categorie, type ReglagesFacturation } from '@/lib/facturation'

/** Ligne de devis / facture telle qu'éditée (stockée dans documents.lignes, JSONB). */
export type LineItem = {
  id: string
  categorie: Categorie
  description: string
  quantite: number
  unite: string
  prix_unitaire: number
  /** Main d'œuvre : durée par personne (heures) et nombre de personnes ; quantite = heures × personnes */
  heures?: number
  personnes?: number
  /** Matériel : prix d'achat et marge %, si le prix a été calculé ainsi */
  prix_achat?: number
  marge?: number
}

export function generateLineId(): string {
  return 'l_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)
}

const num = (v: unknown): number | undefined => {
  const n = Number(v)
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : n
}

export function lineFromRaw(raw: Record<string, unknown>): LineItem {
  const unite = (raw.unite as string) || 'heure'
  const quantite = Number(raw.quantite) || 0
  const categorie = categorieLigne({ categorie: raw.categorie, unite })
  const l: LineItem = {
    id: (raw.id as string) || generateLineId(),
    categorie,
    description: (raw.description as string) || '',
    quantite,
    unite,
    prix_unitaire: Number(raw.prix_unitaire) || 0,
  }
  if (categorie === 'main_oeuvre') {
    l.personnes = Math.max(1, Math.round(num(raw.personnes) ?? 1))
    l.heures = num(raw.heures) ?? quantite / l.personnes
  }
  if (num(raw.prix_achat) !== undefined) {
    l.prix_achat = num(raw.prix_achat)
    l.marge = num(raw.marge) ?? 0
  }
  return l
}

/** Forme enregistrée : on garde les champs utiles à la ré-édition, plus le total. */
export function lineToRaw(l: LineItem): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    id: l.id, categorie: l.categorie, description: l.description.trim(),
    quantite: l.quantite, unite: l.unite, prix_unitaire: l.prix_unitaire,
    total: totalLigne(l.quantite, l.prix_unitaire),
  }
  if (l.categorie === 'main_oeuvre') { raw.heures = l.heures; raw.personnes = l.personnes }
  if (l.prix_achat !== undefined) { raw.prix_achat = l.prix_achat; raw.marge = l.marge }
  return raw
}

/** Ligne neuve pré-remplie avec les réglages de l'artisan. */
export function nouvelleLigne(categorie: Categorie, r: ReglagesFacturation): LineItem {
  const id = generateLineId()
  switch (categorie) {
    case 'main_oeuvre':
      return { id, categorie, description: 'Main d’œuvre', heures: 1, personnes: 1, quantite: 1, unite: 'heure', prix_unitaire: r.tarif_horaire }
    case 'materiel':
      return { id, categorie, description: '', quantite: 1, unite: 'unite', prix_unitaire: 0 }
    case 'deplacement':
      return { id, categorie, description: 'Déplacement', quantite: 1, unite: 'forfait', prix_unitaire: r.tarif_deplacement }
    default:
      return { id, categorie, description: '', quantite: 1, unite: 'forfait', prix_unitaire: 0 }
  }
}

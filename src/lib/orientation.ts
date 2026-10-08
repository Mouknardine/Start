import type { Metier } from '@/lib/metiers'
import { normalizeText } from '@/lib/text'

/**
 * Orientation « décris ton problème, on t'oriente » : associe une description
 * libre aux métiers de METIERS par mots-clés. Pas d'IA, pas d'appel réseau :
 * déterministe et testable.
 *
 * Les mots-clés sont comparés au texte normalisé (normalizeText : minuscules,
 * sans accents) comme des débuts de mots — « fuit » trouve « fuite », « fuyant »
 * non. Un mot-clé de plusieurs mots compte double : il est plus spécifique.
 */
const KEYWORDS: Record<Metier, string[]> = {
  Plombier: [
    'fuit', 'fuite d eau', 'robinet', 'wc', 'toilette', 'chasse d eau', 'evier', 'lavabo', 'canalisation',
    'tuyau', 'bouche', 'debouch', 'douche', 'baignoire', 'boiler', 'chauffe eau', 'siphon', 'egout',
    'degat d eau', 'inond', 'pression d eau', 'mitigeur',
  ],
  Électricien: [
    'prise', 'courant', 'electri', 'disjonct', 'fusible', 'lumiere', 'lampe', 'interrupteur', 'cable',
    'luminaire', 'tableau electrique', 'court circuit', 'borne de recharge', 'ampoule', 'plus de courant',
  ],
  Serrurier: [
    'cle', 'serrure', 'porte bloquee', 'porte claquee', 'enferme', 'cylindre', 'verrou', 'cadenas',
    'effraction', 'porte blindee', 'badge',
  ],
  Chauffagiste: [
    'chauffage', 'chaudiere', 'radiateur', 'pompe a chaleur', 'mazout', 'thermostat', 'bruleur',
    'chauffage au sol', 'plus d eau chaude', 'pas de chauffage', 'froid dans',
  ],
  Peintre: [
    'peint', 'peindre', 'repein', 'facade', 'crepi', 'tapisserie', 'papier peint', 'enduit', 'vernis', 'rafraich',
  ],
  Menuisier: [
    'bois', 'meuble', 'armoire', 'parquet', 'fenetre', 'escalier', 'placard', 'agencement', 'volet',
    'porte qui frotte', 'etagere', 'dressing',
  ],
  Carreleur: [
    'carrel', 'carreau', 'faience', 'joint', 'mosaique', 'dallage', 'plinthe',
  ],
  Maçon: [
    'macon', 'beton', 'fissure', 'mur porteur', 'brique', 'chape', 'fondation', 'muret', 'dalle',
    'demoli', 'ouverture dans un mur',
  ],
  Couvreur: [
    'toit', 'tuile', 'gouttiere', 'cheneau', 'ardoise', 'velux', 'fuite au plafond', 'charpente',
    'cheminee', 'infiltration',
  ],
  Jardinier: [
    'jardin', 'haie', 'gazon', 'pelouse', 'arbre', 'tondre', 'tonte', 'elagage', 'elaguer', 'massif',
    'debroussaill', 'arrosage', 'feuilles mortes', 'potager',
  ],
}

export const MIN_DESCRIPTION_LENGTH = 3

/**
 * Métiers suggérés pour une description, du plus au moins probable
 * (au plus `limit`). Tableau vide si rien ne correspond.
 */
export function suggestMetiers(description: string, limit = 3): Metier[] {
  const text = ` ${normalizeText(description)} `
  if (text.trim().length < MIN_DESCRIPTION_LENGTH) return []

  const scored: { metier: Metier; score: number; order: number }[] = []
  ;(Object.keys(KEYWORDS) as Metier[]).forEach((metier, order) => {
    let score = 0
    for (const keyword of KEYWORDS[metier]) {
      if (text.includes(` ${keyword}`)) score += keyword.includes(' ') ? 2 : 1
    }
    if (score > 0) scored.push({ metier, score, order })
  })

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.metier)
}

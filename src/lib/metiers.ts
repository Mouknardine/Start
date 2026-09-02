/**
 * Liste canonique des métiers — source unique pour l'inscription, le profil
 * et la recherche. Les accents comptent pour l'affichage uniquement : la
 * recherche compare des valeurs normalisées (norm_text côté DB).
 */
export const METIERS = [
  'Plombier',
  'Électricien',
  'Serrurier',
  'Chauffagiste',
  'Peintre',
  'Menuisier',
  'Carreleur',
  'Maçon',
  'Couvreur',
  'Jardinier',
] as const

export type Metier = (typeof METIERS)[number]

export const METIER_AUTRE = 'Autre'
export const METIERS_AVEC_AUTRE = [...METIERS, METIER_AUTRE] as const

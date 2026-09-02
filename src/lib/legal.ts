import { CONTACT_EMAIL } from '@/lib/site'

/**
 * Identité légale de l'exploitant — source unique pour /mentions-legales.
 *
 * Remplir les champs `null` avant la mise en production publique. Tant qu'un
 * champ obligatoire manque, la page mentions légales reste en `noindex` et
 * affiche un bandeau « en cours de rédaction » (LCD art. 3 al. 1 let. s :
 * un site commercial doit identifier clairement son exploitant).
 */
export const LEGAL = {
  /** Nom commercial affiché */
  brand: 'Artisano',
  /** Raison sociale exacte telle qu'inscrite au RC — ex. « Artisano Sàrl » */
  raisonSociale: null as string | null,
  /** Forme juridique — ex. « Sàrl », « SA », « Raison individuelle » */
  formeJuridique: null as string | null,
  /** Adresse complète du siège — ex. « Rue du Lac 15, 1003 Lausanne, Suisse » */
  siege: null as string | null,
  /** Numéro IDE — ex. « CHE-123.456.789 » */
  ide: null as string | null,
  /** Numéro TVA — ex. « CHE-123.456.789 TVA » ou « Non assujetti à la TVA » */
  tva: null as string | null,
  /** Inscription RC — ex. « Registre du commerce du canton de Vaud, n° CH-550.1.234.567-8 » */
  registreCommerce: null as string | null,
  /** Représentant légal — ex. « Prénom Nom, associé gérant » */
  representant: null as string | null,
  /** Responsable éditorial (peut être le représentant légal) */
  directeurPublication: null as string | null,
  /** Facultatif */
  telephone: null as string | null,
  email: CONTACT_EMAIL,
  /** For juridique (tribunaux compétents) — aligné sur le siège */
  forJuridique: 'canton de Vaud',
  derniereMiseAJour: 'septembre 2026',
}

/** Champs sans lesquels les mentions légales ne sont pas conformes. */
const CHAMPS_OBLIGATOIRES = [
  'raisonSociale',
  'formeJuridique',
  'siege',
  'ide',
  'representant',
] as const satisfies readonly (keyof typeof LEGAL)[]

export const LEGAL_COMPLETE = CHAMPS_OBLIGATOIRES.every((k) => Boolean(LEGAL[k]))

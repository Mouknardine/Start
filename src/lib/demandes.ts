/**
 * Statuts des demandes — libellés, regroupements et étapes d'avancement,
 * partagés entre l'espace artisan (/dashboard) et l'espace client (/client).
 *
 * Statuts en base : nouvelle | acceptee | confirmee | refusee | terminee
 * (« confirmee » est un ancien statut équivalent à « acceptee »).
 */

export type StatutDemande = 'nouvelle' | 'acceptee' | 'confirmee' | 'refusee' | 'terminee'

/** Regroupements utilisés par les filtres de la boîte de réception artisan. */
export type GroupeDemande = 'nouvelles' | 'en_cours' | 'terminees' | 'refusees'

export function groupeDemande(statut: string | null | undefined): GroupeDemande {
  if (statut === 'acceptee' || statut === 'confirmee') return 'en_cours'
  if (statut === 'terminee') return 'terminees'
  if (statut === 'refusee') return 'refusees'
  return 'nouvelles'
}

export const GROUPES: { key: GroupeDemande | 'toutes'; label: string }[] = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'nouvelles', label: 'Nouvelles' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'terminees', label: 'Terminées' },
  { key: 'refusees', label: 'Refusées' },
]

/** Nombre de demandes par groupe (+ total). */
export function compterParGroupe(statuts: (string | null | undefined)[]): Record<GroupeDemande | 'toutes', number> {
  const counts = { toutes: statuts.length, nouvelles: 0, en_cours: 0, terminees: 0, refusees: 0 }
  for (const s of statuts) counts[groupeDemande(s)]++
  return counts
}

/**
 * Libellé d'un statut. Le point de vue change le premier état : pour
 * l'artisan c'est une « Nouvelle » demande, pour le client elle est « En attente ».
 */
export function libelleStatut(statut: string | null | undefined, vue: 'artisan' | 'client'): string {
  switch (statut) {
    case 'acceptee':
    case 'confirmee':
      return 'Acceptée'
    case 'refusee':
      return vue === 'client' ? 'Déclinée' : 'Refusée'
    case 'terminee':
      return 'Terminée'
    default:
      return vue === 'client' ? 'En attente' : 'Nouvelle'
  }
}

/** Classes Tailwind de la pastille de statut. */
export function couleurStatut(statut: string | null | undefined): string {
  switch (groupeDemande(statut)) {
    case 'en_cours':
      return 'bg-[var(--green-light)] text-[var(--green)]'
    case 'terminees':
      return 'bg-[rgba(46,125,50,0.1)] text-[#2E7D32]'
    case 'refusees':
      return 'bg-[var(--red-light)] text-[var(--red)]'
    default:
      return 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]'
  }
}

export function libelleType(type: string | null | undefined): string {
  if (type === 'devis') return 'Demande de rendez-vous'
  if (type === 'message') return 'Message rapide'
  return 'Demande'
}

export type EtapeProgression = { label: string; etat: 'fait' | 'actuel' | 'a_venir' | 'echec' }

/**
 * Étapes d'avancement d'une demande : Envoyée → Acceptée → Terminée,
 * ou Envoyée → Déclinée.
 */
export function etapesDemande(statut: string | null | undefined): EtapeProgression[] {
  const groupe = groupeDemande(statut)
  if (groupe === 'refusees') {
    return [
      { label: 'Envoyée', etat: 'fait' },
      { label: 'Déclinée', etat: 'echec' },
    ]
  }
  return [
    { label: 'Envoyée', etat: 'fait' },
    { label: 'Acceptée', etat: groupe === 'nouvelles' ? 'actuel' : 'fait' },
    { label: 'Terminée', etat: groupe === 'terminees' ? 'fait' : groupe === 'en_cours' ? 'actuel' : 'a_venir' },
  ]
}

/** « À l'instant », « Il y a 5 min », « Il y a 3h », « Hier », « Il y a 4 jours », puis la date. */
export function ilYA(dateStr: string, now: number = Date.now()): string {
  const diff = Math.floor((now - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'À l’instant'
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'Hier'
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} jours`
  return new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Message envoyé au client quand l'artisan décline une demande. */
export function messageRefus(motif: string, precision: string): string {
  const detail = precision.trim()
  const base = `Demande déclinée — motif : ${motif.toLowerCase()}.`
  return detail ? `${base}\n${detail}` : base
}

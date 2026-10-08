import { describe, it, expect } from 'vitest'
import { groupeDemande, compterParGroupe, libelleStatut, etapesDemande, ilYA, messageRefus } from '@/lib/demandes'

describe('groupeDemande / compterParGroupe', () => {
  it('regroupe acceptee et confirmee en « en cours »', () => {
    expect(groupeDemande('acceptee')).toBe('en_cours')
    expect(groupeDemande('confirmee')).toBe('en_cours')
    expect(groupeDemande('nouvelle')).toBe('nouvelles')
    expect(groupeDemande(null)).toBe('nouvelles')
  })

  it('compte par groupe avec le total', () => {
    expect(compterParGroupe(['nouvelle', 'acceptee', 'confirmee', 'terminee', 'refusee', 'nouvelle'])).toEqual({
      toutes: 6, nouvelles: 2, en_cours: 2, terminees: 1, refusees: 1,
    })
  })
})

describe('libelleStatut', () => {
  it('adapte le libellé au point de vue', () => {
    expect(libelleStatut('nouvelle', 'artisan')).toBe('Nouvelle')
    expect(libelleStatut('nouvelle', 'client')).toBe('En attente')
    expect(libelleStatut('refusee', 'client')).toBe('Déclinée')
    expect(libelleStatut('confirmee', 'client')).toBe('Acceptée')
  })
})

describe('etapesDemande', () => {
  it('nouvelle : acceptation en cours', () => {
    expect(etapesDemande('nouvelle').map((e) => e.etat)).toEqual(['fait', 'actuel', 'a_venir'])
  })
  it('acceptée : intervention en cours', () => {
    expect(etapesDemande('acceptee').map((e) => e.etat)).toEqual(['fait', 'fait', 'actuel'])
  })
  it('terminée : tout est fait', () => {
    expect(etapesDemande('terminee').map((e) => e.etat)).toEqual(['fait', 'fait', 'fait'])
  })
  it('refusée : deux étapes, la seconde en échec', () => {
    expect(etapesDemande('refusee')).toEqual([{ label: 'Envoyée', etat: 'fait' }, { label: 'Déclinée', etat: 'echec' }])
  })
})

describe('ilYA', () => {
  const now = new Date('2026-10-08T12:00:00Z').getTime()
  it('formate les durées courtes', () => {
    expect(ilYA('2026-10-08T11:59:30Z', now)).toBe('À l’instant')
    expect(ilYA('2026-10-08T11:55:00Z', now)).toBe('Il y a 5 min')
    expect(ilYA('2026-10-08T09:00:00Z', now)).toBe('Il y a 3h')
    expect(ilYA('2026-10-07T10:00:00Z', now)).toBe('Hier')
    expect(ilYA('2026-10-04T12:00:00Z', now)).toBe('Il y a 4 jours')
  })
})

describe('messageRefus', () => {
  it('inclut le motif et la précision éventuelle', () => {
    expect(messageRefus('Calendrier complet', '')).toBe('Demande déclinée — motif : calendrier complet.')
    expect(messageRefus('Autre raison', '  Je ne fais pas ce type de chantier. ')).toBe(
      'Demande déclinée — motif : autre raison.\nJe ne fais pas ce type de chantier.',
    )
  })
})

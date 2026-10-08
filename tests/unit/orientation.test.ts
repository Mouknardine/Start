import { describe, it, expect } from 'vitest'
import { suggestMetiers } from '@/lib/orientation'
import { METIERS } from '@/lib/metiers'

describe('suggestMetiers', () => {
  it('oriente les problèmes courants vers le bon métier', () => {
    expect(suggestMetiers('Fuite sous l’évier de la cuisine')[0]).toBe('Plombier')
    expect(suggestMetiers('Le disjoncteur saute dès que j’allume le four')[0]).toBe('Électricien')
    expect(suggestMetiers('Porte claquée, clés à l’intérieur')[0]).toBe('Serrurier')
    expect(suggestMetiers('La chaudière ne démarre plus')[0]).toBe('Chauffagiste')
    expect(suggestMetiers('Repeindre le salon')[0]).toBe('Peintre')
    expect(suggestMetiers('Tailler la haie et tondre la pelouse')[0]).toBe('Jardinier')
    expect(suggestMetiers('Tuiles cassées sur le toit après la tempête')[0]).toBe('Couvreur')
    expect(suggestMetiers('Refaire le carrelage de la salle de bain')[0]).toBe('Carreleur')
  })

  it('ignore la casse et les accents', () => {
    expect(suggestMetiers('CHAUDIERE EN PANNE')).toEqual(suggestMetiers('chaudière en panne'))
  })

  it('compare des débuts de mots, pas des sous-chaînes', () => {
    // « cle » ne doit pas matcher « boucle », ni « toit » « bistoit »
    expect(suggestMetiers('une boucle')).toEqual([])
  })

  it('retourne au plus `limit` métiers, tous issus de METIERS', () => {
    const res = suggestMetiers('fuite robinet prise courant serrure chaudière toit jardin', 2)
    expect(res).toHaveLength(2)
    res.forEach((m) => expect(METIERS).toContain(m))
  })

  it('retourne un tableau vide sans correspondance ou texte trop court', () => {
    expect(suggestMetiers('')).toEqual([])
    expect(suggestMetiers('ab')).toEqual([])
    expect(suggestMetiers('bonjour, j’ai une question')).toEqual([])
  })
})

describe('exemples de la page d’accueil', () => {
  it('chaque exemple proposé mène à un métier', () => {
    for (const ex of ['Fuite sous l’évier', 'Porte claquée', 'Le disjoncteur saute', 'Chaudière en panne', 'Tailler la haie']) {
      expect(suggestMetiers(ex).length, ex).toBeGreaterThan(0)
    }
  })
})

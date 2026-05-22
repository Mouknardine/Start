import { describe, it, expect } from 'vitest'
import {
  artisanProfileSchema,
  documentSchema,
  employeSchema,
  affectationSchema,
  prestationSchema,
  demandeStatusSchema,
} from '@/lib/validation/schemas'

describe('artisanProfileSchema', () => {
  it('accepte un profil minimal', () => {
    const r = artisanProfileSchema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('accepte un profil complet', () => {
    const r = artisanProfileSchema.safeParse({
      prenom: 'Jean',
      nom: 'Müller',
      entreprise: 'Müller & Fils Sàrl',
      telephone: '0791234567',
      metier: 'Plombier',
      specialites: ['Sanitaire', 'Salle de bain'],
      zones: ['Lausanne', 'Renens'],
      description: 'Plombier expérimenté',
      urgence: true,
      contact_prefs: { complete: true, message: false, appel: true },
      avatar_url: 'https://example.com/avatar.jpg',
      gallery_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    })
    expect(r.success).toBe(true)
  })

  it('rejette les champs bancaires (strict mode)', () => {
    const r = artisanProfileSchema.safeParse({
      prenom: 'Jean',
      bank_iban: 'CH93 0076 2011 6238 5295 7', // ne devrait jamais passer ici
    })
    expect(r.success).toBe(false)
  })

  it('rejette un nom > 50 chars', () => {
    const r = artisanProfileSchema.safeParse({ nom: 'x'.repeat(60) })
    expect(r.success).toBe(false)
  })

  it('rejette une description > 2000 chars', () => {
    const r = artisanProfileSchema.safeParse({ description: 'x'.repeat(2500) })
    expect(r.success).toBe(false)
  })

  it('rejette plus de 50 spécialités', () => {
    const r = artisanProfileSchema.safeParse({ specialites: new Array(60).fill('x') })
    expect(r.success).toBe(false)
  })
})

describe('documentSchema', () => {
  const valid = {
    type: 'devis' as const,
    client_nom: 'Jean Dupont',
    lignes: [{ description: 'Travail', quantite: 1, prix_unitaire: 100 }],
    sous_total: 100,
    taux_tva: 8.1,
    montant_tva: 8.1,
    total_ttc: 108.1,
    date_emission: '2026-05-15',
  }

  it('accepte un devis valide', () => {
    const r = documentSchema.safeParse(valid)
    expect(r.success).toBe(true)
  })

  it('rejette un type invalide', () => {
    const r = documentSchema.safeParse({ ...valid, type: 'autre' })
    expect(r.success).toBe(false)
  })

  it('rejette un montant négatif', () => {
    const r = documentSchema.safeParse({ ...valid, total_ttc: -10 })
    expect(r.success).toBe(false)
  })

  it('rejette un taux TVA hors bornes', () => {
    expect(documentSchema.safeParse({ ...valid, taux_tva: -1 }).success).toBe(false)
    expect(documentSchema.safeParse({ ...valid, taux_tva: 150 }).success).toBe(false)
  })

  it('rejette plus de 200 lignes', () => {
    const r = documentSchema.safeParse({
      ...valid,
      lignes: new Array(250).fill({ description: 'x', quantite: 1, prix_unitaire: 1 }),
    })
    expect(r.success).toBe(false)
  })
})

describe('employeSchema', () => {
  it('accepte un employé valide', () => {
    const r = employeSchema.safeParse({
      prenom: 'Marie',
      nom: 'Dupond',
      telephone: '0791234567',
      email: 'marie@example.com',
      couleur: '#FF5733',
      poste: 'Apprentie',
    })
    expect(r.success).toBe(true)
  })

  it('accepte email vide', () => {
    const r = employeSchema.safeParse({ prenom: 'Marie', nom: 'Dupond', email: '' })
    expect(r.success).toBe(true)
  })

  it('rejette couleur invalide', () => {
    const r = employeSchema.safeParse({
      prenom: 'Marie', nom: 'Dupond', couleur: 'red',
    })
    expect(r.success).toBe(false)
  })

  it('rejette prénom vide', () => {
    const r = employeSchema.safeParse({ prenom: '', nom: 'X' })
    expect(r.success).toBe(false)
  })
})

describe('affectationSchema', () => {
  const valid = {
    employe_id: 'b79cc358-e7fe-47ab-b3d8-cb1114f56c92',
    titre: 'Chantier Place de la Riponne',
    date_debut: '2026-05-20',
    heure_debut: '08:00',
    heure_fin: '17:00',
  }

  it('accepte une affectation valide', () => {
    const r = affectationSchema.safeParse(valid)
    expect(r.success).toBe(true)
  })

  it('rejette employe_id non-UUID', () => {
    const r = affectationSchema.safeParse({ ...valid, employe_id: 'pas-un-uuid' })
    expect(r.success).toBe(false)
  })

  it('rejette titre vide', () => {
    const r = affectationSchema.safeParse({ ...valid, titre: '' })
    expect(r.success).toBe(false)
  })
})

describe('prestationSchema', () => {
  it('accepte une prestation valide', () => {
    const r = prestationSchema.safeParse({
      nom: 'Débouchage évier',
      prix: 120,
      unite: 'forfait',
    })
    expect(r.success).toBe(true)
  })

  it('rejette prix négatif', () => {
    const r = prestationSchema.safeParse({ nom: 'X', prix: -10 })
    expect(r.success).toBe(false)
  })

  it('rejette prix > 1M', () => {
    const r = prestationSchema.safeParse({ nom: 'X', prix: 1_500_000 })
    expect(r.success).toBe(false)
  })

  it('rejette nom vide', () => {
    const r = prestationSchema.safeParse({ nom: '', prix: 100 })
    expect(r.success).toBe(false)
  })
})

describe('demandeStatusSchema', () => {
  it('accepte les valeurs valides', () => {
    expect(demandeStatusSchema.safeParse('nouvelle').success).toBe(true)
    expect(demandeStatusSchema.safeParse('acceptee').success).toBe(true)
    expect(demandeStatusSchema.safeParse('confirmee').success).toBe(true)
    expect(demandeStatusSchema.safeParse('refusee').success).toBe(true)
    expect(demandeStatusSchema.safeParse('terminee').success).toBe(true)
  })

  it('rejette une valeur invalide', () => {
    expect(demandeStatusSchema.safeParse('🚀').success).toBe(false)
    expect(demandeStatusSchema.safeParse('archived').success).toBe(false)
    expect(demandeStatusSchema.safeParse('').success).toBe(false)
    expect(demandeStatusSchema.safeParse('NOUVELLE').success).toBe(false) // case sensitive
  })
})

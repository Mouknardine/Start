import { describe, it, expect } from 'vitest'
import {
  parseDecimal, formatDecimalInput, formatCHF, formatDateCH, todayISO, addDaysISO,
  calculerTotaux, totalLigne, estEnRetard, etatDocument, etapesDocument,
  resumeFacturation, clientsRecents, emailValide, type DocResume,
  arrondi5, prixDepuisAchat, parseDuree, formatDuree, quantiteLisible, detailLigne,
  categorieLigne, regrouperLignes, normaliserReglages, formatNumeroTva, dateLongue,
  localiteDepuisAdresse, REGLAGES_DEFAUT, formatPrixCourt, resumeLigne,
} from '@/lib/facturation'

const doc = (p: Partial<DocResume>): DocResume => ({
  id: 'x', type: 'facture', statut: 'brouillon', total_ttc: 100, date_emission: '2026-10-01',
  date_echeance: null, date_paiement: null, client_nom: 'Client', created_at: '2026-10-01T10:00:00Z', ...p,
})

describe('parseDecimal', () => {
  it('accepte la virgule et le point', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('1.5')).toBe(1.5)
  })
  it('ignore les séparateurs de milliers suisses', () => {
    expect(parseDecimal("1'250.50")).toBe(1250.5)
    expect(parseDecimal('2 400')).toBe(2400)
  })
  it('vide, invalide ou négatif → 0', () => {
    expect(parseDecimal('')).toBe(0)
    expect(parseDecimal('abc')).toBe(0)
    expect(parseDecimal('-3')).toBe(0)
  })
  it('formatDecimalInput arrondit au centime sans zéros inutiles', () => {
    expect(formatDecimalInput(1.5)).toBe('1.5')
    expect(formatDecimalInput(95)).toBe('95')
    expect(formatDecimalInput(0.1 + 0.2)).toBe('0.3')
  })
})

describe('formatage', () => {
  it('formatCHF avec apostrophes', () => {
    expect(formatCHF(3264.62)).toBe("3'264.62 CHF")
    expect(formatCHF(0)).toBe('0.00 CHF')
  })
  it('formatDateCH', () => {
    expect(formatDateCH('2026-10-09')).toBe('09.10.2026')
    expect(formatDateCH(null)).toBe('')
  })
  it('todayISO utilise la date locale', () => {
    expect(todayISO(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
  })
  it('addDaysISO traverse les mois', () => {
    expect(addDaysISO('2026-10-09', 30)).toBe('2026-11-08')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('calculerTotaux', () => {
  const lignes = [{ quantite: 1, prix_unitaire: 180 }, { quantite: 1.5, prix_unitaire: 95 }]
  it('TVA au centime, total arrondi aux 5 centimes avec l’écart affiché', () => {
    expect(calculerTotaux(lignes, 'aucune', 0, 8.1)).toEqual({ sousTotal: 322.5, montantRemise: 0, montantTva: 26.12, arrondi: -0.02, totalTtc: 348.6 })
  })
  it('remise en pourcentage (bornée à 100 %)', () => {
    expect(calculerTotaux(lignes, 'pourcentage', 10, 0).montantRemise).toBe(32.25)
    expect(calculerTotaux(lignes, 'pourcentage', 150, 0).totalTtc).toBe(0)
  })
  it('remise en francs plafonnée au sous-total', () => {
    expect(calculerTotaux(lignes, 'montant', 1000, 8.1).totalTtc).toBe(0)
    expect(calculerTotaux(lignes, 'montant', 22.5, 0).totalTtc).toBe(300)
  })
  it('totalLigne arrondi', () => {
    expect(totalLigne(3, 0.1)).toBe(0.3)
  })
})

describe('statuts', () => {
  const today = '2026-10-09'
  it('facture envoyée échue = en retard', () => {
    expect(estEnRetard(doc({ statut: 'envoyee', date_echeance: '2026-10-08' }), today)).toBe(true)
    expect(estEnRetard(doc({ statut: 'envoyee', date_echeance: '2026-10-09' }), today)).toBe(false)
    expect(estEnRetard(doc({ type: 'devis', statut: 'envoye', date_echeance: '2026-01-01' }), today)).toBe(false)
  })
  it('range chaque document dans le bon groupe', () => {
    expect(etatDocument(doc({ statut: 'brouillon' }), today).groupe).toBe('brouillons')
    expect(etatDocument(doc({ type: 'devis', statut: 'accepte' }), today)).toEqual({ groupe: 'a_traiter', libelle: 'À facturer', ton: 'action' })
    expect(etatDocument(doc({ statut: 'envoyee', date_echeance: '2026-09-01' }), today).groupe).toBe('a_traiter')
    expect(etatDocument(doc({ statut: 'envoyee', date_echeance: '2026-11-01' }), today).groupe).toBe('en_attente')
    expect(etatDocument(doc({ statut: 'payee' }), today).groupe).toBe('clotures')
    expect(etatDocument(doc({ type: 'devis', statut: 'converti' }), today).libelle).toBe('Facturé')
  })
  it('frise du devis', () => {
    expect(etapesDocument('devis', 'envoye').map((e) => e.etat)).toEqual(['fait', 'actuel', 'a_venir', 'a_venir'])
    expect(etapesDocument('devis', 'converti').every((e) => e.etat === 'fait')).toBe(true)
    expect(etapesDocument('devis', 'refuse')[2]).toEqual({ label: 'Refusé', etat: 'actuel', alerte: true })
  })
  it('frise de la facture', () => {
    expect(etapesDocument('facture', 'brouillon').map((e) => e.etat)).toEqual(['actuel', 'a_venir', 'a_venir'])
    expect(etapesDocument('facture', 'envoyee', true)[1]).toEqual({ label: 'En retard', etat: 'actuel', alerte: true })
    expect(etapesDocument('facture', 'payee').every((e) => e.etat === 'fait')).toBe(true)
  })
})

describe('resumeFacturation', () => {
  it('additionne à encaisser, devis en attente et encaissé du mois', () => {
    const r = resumeFacturation([
      doc({ statut: 'envoyee', total_ttc: 1000, date_echeance: '2026-10-01' }),
      doc({ statut: 'en_retard', total_ttc: 500 }),
      doc({ type: 'devis', statut: 'envoye', total_ttc: 200 }),
      doc({ statut: 'payee', total_ttc: 300, date_paiement: '2026-10-02' }),
      doc({ statut: 'payee', total_ttc: 999, date_paiement: '2026-09-30' }),
      doc({ statut: 'brouillon', total_ttc: 50 }),
    ], '2026-10-09')
    expect(r).toEqual({ aEncaisser: 1500, nbAEncaisser: 2, nbEnRetard: 2, devisEnAttente: 200, nbDevisEnAttente: 1, encaisseMois: 300 })
  })
})

describe('clientsRecents', () => {
  it('dédoublonne par nom, le plus récent d’abord', () => {
    const r = clientsRecents([
      doc({ client_nom: 'Jean Dupont', client_email: 'old@x.ch', created_at: '2026-01-01' }),
      doc({ client_nom: 'jean dupont ', client_email: 'new@x.ch', created_at: '2026-05-01' }),
      doc({ client_nom: '', created_at: '2026-06-01' }),
      doc({ client_nom: 'Anne Leroy', created_at: '2026-03-01' }),
    ])
    expect(r.map((c) => c.nom)).toEqual(['jean dupont', 'Anne Leroy'])
    expect(r[0].email).toBe('new@x.ch')
  })
})

describe('emailValide', () => {
  it('accepte une adresse simple, refuse le reste', () => {
    expect(emailValide('client@example.ch')).toBe(true)
    expect(emailValide('client@example')).toBe(false)
    expect(emailValide('pas une adresse')).toBe(false)
  })
})

describe('arrondis et prix', () => {
  it('arrondi5', () => {
    expect(arrondi5(348.62)).toBe(348.6)
    expect(arrondi5(348.63)).toBe(348.65)
    expect(arrondi5(10.025)).toBe(10.05)
  })
  it('prix de vente = achat + marge, aux 5 centimes', () => {
    expect(prixDepuisAchat(10, 20)).toBe(12)
    expect(prixDepuisAchat(12.34, 25)).toBe(15.45)
    expect(prixDepuisAchat(-5, 20)).toBe(0)
  })
})

describe('durées', () => {
  it('lit les écritures courantes', () => {
    expect(parseDuree('1h30')).toBe(1.5)
    expect(parseDuree('1 h 30')).toBe(1.5)
    expect(parseDuree('1:45')).toBe(1.75)
    expect(parseDuree('2h')).toBe(2)
    expect(parseDuree('1,5')).toBe(1.5)
    expect(parseDuree('90 min')).toBe(1.5)
    expect(parseDuree('')).toBeNull()
    expect(parseDuree('demain')).toBeNull()
  })
  it('affiche en heures et minutes', () => {
    expect(formatDuree(0.5)).toBe('30 min')
    expect(formatDuree(1)).toBe('1 h')
    expect(formatDuree(1.5)).toBe('1 h 30')
    expect(formatDuree(2.25)).toBe('2 h 15')
  })
  it('quantité lisible selon l’unité', () => {
    expect(quantiteLisible(4.5, 'heure')).toBe('4 h 30')
    expect(quantiteLisible(3, 'unite')).toBe('3 pce')
    expect(quantiteLisible(1, 'forfait')).toBe('forfait')
    expect(quantiteLisible(12.5, 'm2')).toBe('12.5 m²')
  })
})

describe('catégories de lignes', () => {
  it('déduit la catégorie des anciennes lignes', () => {
    expect(categorieLigne({ unite: 'heure' })).toBe('main_oeuvre')
    expect(categorieLigne({ unite: 'm2' })).toBe('forfait')
    expect(categorieLigne({ categorie: 'materiel', unite: 'heure' })).toBe('materiel')
  })
  it('détail équipe', () => {
    expect(detailLigne({ categorie: 'main_oeuvre', heures: 4, personnes: 2 })).toBe('2 personnes × 4 h')
    expect(detailLigne({ categorie: 'main_oeuvre', heures: 4, personnes: 1 })).toBe('')
  })
  it('regroupe dans l’ordre métier', () => {
    const g = regrouperLignes([
      { categorie: 'deplacement', unite: 'forfait' },
      { categorie: 'materiel', unite: 'unite' },
      { unite: 'heure' },
    ])
    expect(g.map(x => x.categorie)).toEqual(['main_oeuvre', 'materiel', 'deplacement'])
  })
})

describe('réglages', () => {
  it('complète et borne les valeurs', () => {
    expect(normaliserReglages(null)).toEqual(REGLAGES_DEFAUT)
    const r = normaliserReglages({ tarif_horaire: '95', marge_materiel: -3, assujetti_tva: false, delai_paiement: 29.6 })
    expect(r.tarif_horaire).toBe(95)
    expect(r.marge_materiel).toBe(REGLAGES_DEFAUT.marge_materiel)
    expect(r.assujetti_tva).toBe(false)
    expect(r.delai_paiement).toBe(30)
  })
  it('met en forme le numéro TVA', () => {
    expect(formatNumeroTva('che123456789')).toBe('CHE-123.456.789 TVA')
    expect(formatNumeroTva('CHE-123.456.789 MWST')).toBe('CHE-123.456.789 TVA')
    expect(formatNumeroTva('12')).toBe('12')
  })
})

describe('textes du document', () => {
  it('date longue et localité', () => {
    expect(dateLongue('2026-10-09')).toBe('9 octobre 2026')
    expect(localiteDepuisAdresse('Rue du Lac 15, 1003 Lausanne')).toBe('Lausanne')
    expect(localiteDepuisAdresse('Chemin des Prés 2\n1400 Yverdon-les-Bains')).toBe('Yverdon-les-Bains')
    expect(localiteDepuisAdresse('')).toBe('')
  })
})

describe('résumé de ligne', () => {
  it('prix court', () => {
    expect(formatPrixCourt(95)).toBe('95.–')
    expect(formatPrixCourt(14.8)).toBe('14.80')
  })
  it('main d’œuvre et matériel', () => {
    expect(resumeLigne({ categorie: 'main_oeuvre', unite: 'heure', quantite: 8, prix_unitaire: 95, heures: 4, personnes: 2 })).toBe('2 pers. × 4 h × 95.–/h')
    expect(resumeLigne({ categorie: 'main_oeuvre', unite: 'heure', quantite: 1.5, prix_unitaire: 95 })).toBe('1 h 30 × 95.–/h')
    expect(resumeLigne({ categorie: 'materiel', unite: 'unite', quantite: 2, prix_unitaire: 14.8 })).toBe('2 pce × 14.80')
  })
})

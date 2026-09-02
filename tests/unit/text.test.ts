import { describe, it, expect } from 'vitest'
import { normalizeText } from '@/lib/text'

/**
 * normalizeText() doit rester le miroir exact de public.norm_text()
 * (migration 0014). Cas alignés sur les « Tests post-migration » du fichier SQL.
 */
describe('normalizeText', () => {
  it('retire les accents et met en minuscules', () => {
    expect(normalizeText('Épalinges')).toBe('epalinges')
    expect(normalizeText('Électricien')).toBe('electricien')
    expect(normalizeText('Genève')).toBe('geneve')
    expect(normalizeText('Zürich')).toBe('zurich')
  })

  it('réduit tirets, apostrophes et points à un espace', () => {
    expect(normalizeText('Yverdon-les-Bains')).toBe('yverdon les bains')
    expect(normalizeText("L'Isle")).toBe('l isle')
    expect(normalizeText('St. Gallen')).toBe('st gallen')
    expect(normalizeText('Le Mont-sur-Lausanne')).toBe('le mont sur lausanne')
  })

  it('gère les ligatures germaniques', () => {
    expect(normalizeText('Straße')).toBe('strasse')
    expect(normalizeText('Œuvre')).toBe('oeuvre')
  })

  it('normalise les espaces', () => {
    expect(normalizeText('  Lausanne   25 ')).toBe('lausanne 25')
    expect(normalizeText('')).toBe('')
    expect(normalizeText(null)).toBe('')
  })
})

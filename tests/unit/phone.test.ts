import { describe, it, expect } from 'vitest'
import { telHref } from '@/lib/phone'

describe('telHref', () => {
  it('convertit un numéro national suisse en +41 sans le 0', () => {
    expect(telHref('021 123 45 67')).toBe('tel:+41211234567')
    expect(telHref('079.123.45.67')).toBe('tel:+41791234567')
  })

  it('garde un numéro déjà international', () => {
    expect(telHref('+41 21 123 45 67')).toBe('tel:+41211234567')
    expect(telHref('+33 6 12 34 56 78')).toBe('tel:+33612345678')
    expect(telHref('0041 79 123 45 67')).toBe('tel:+41791234567')
  })

  it('préfixe +41 un numéro sans indicatif ni 0', () => {
    expect(telHref('79 123 45 67')).toBe('tel:+41791234567')
  })

  it('retourne une chaîne vide sans chiffres', () => {
    expect(telHref('')).toBe('')
    expect(telHref(null)).toBe('')
    expect(telHref('—')).toBe('')
  })
})

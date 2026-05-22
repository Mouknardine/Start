import { describe, it, expect } from 'vitest'
import { normalizeIde, isValidIdeChecksum } from '@/lib/zefix'

describe('normalizeIde', () => {
  it('accepte le format canonique CHE-XXX.XXX.XXX', () => {
    expect(normalizeIde('CHE-123.456.789')).toBe('CHE-123.456.789')
  })

  it('normalise un IDE sans séparateurs', () => {
    expect(normalizeIde('CHE123456789')).toBe('CHE-123.456.789')
  })

  it('normalise un IDE avec espaces', () => {
    expect(normalizeIde('CHE 123 456 789')).toBe('CHE-123.456.789')
  })

  it('normalise en mélangeant majuscules/minuscules', () => {
    expect(normalizeIde('che-123.456.789')).toBe('CHE-123.456.789')
  })

  it('rejette les formats invalides', () => {
    expect(normalizeIde('123456789')).toBeNull()
    expect(normalizeIde('CHE-12.345.678')).toBeNull() // 8 chiffres au lieu de 9
    expect(normalizeIde('XYZ-123.456.789')).toBeNull()
    expect(normalizeIde('')).toBeNull()
  })
})

describe('isValidIdeChecksum', () => {
  // IDE généré algorithmiquement : digits = 1,0,0,0,0,0,0,0
  // sum = 5, mod 11 = 5, check = 6 → CHE-100.000.006
  it('valide un IDE avec checksum correct', () => {
    expect(isValidIdeChecksum('CHE-100.000.006')).toBe(true)
  })

  // digits = 1,2,3,4,5,6,7,8 ; sum = 168, mod 11 = 3, check = 8
  it('valide un autre IDE avec checksum correct', () => {
    expect(isValidIdeChecksum('CHE-123.456.788')).toBe(true)
  })

  it('rejette un IDE avec mauvais checksum', () => {
    expect(isValidIdeChecksum('CHE-123.456.789')).toBe(false)
    expect(isValidIdeChecksum('CHE-100.000.007')).toBe(false)
  })

  it('rejette si pas exactement 9 chiffres', () => {
    expect(isValidIdeChecksum('CHE-12.345.678')).toBe(false)
  })
})

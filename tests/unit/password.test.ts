import { describe, it, expect } from 'vitest'
import { isPasswordValid } from '@/components/PasswordStrength'

describe('isPasswordValid', () => {
  it('accepte un mot de passe fort', () => {
    expect(isPasswordValid('Plombier1')).toBe(true)
    expect(isPasswordValid('Secret123')).toBe(true)
    expect(isPasswordValid('MonMotDePasse42!')).toBe(true)
  })

  it('rejette les mots de passe trop courts', () => {
    expect(isPasswordValid('Abc1')).toBe(false)
    expect(isPasswordValid('Sec12')).toBe(false)
  })

  it('rejette les mots de passe sans majuscule', () => {
    expect(isPasswordValid('plombier1')).toBe(false)
  })

  it('rejette les mots de passe sans minuscule', () => {
    expect(isPasswordValid('PLOMBIER1')).toBe(false)
  })

  it('rejette les mots de passe sans chiffre', () => {
    expect(isPasswordValid('PlombierABC')).toBe(false)
  })

  it('rejette vide', () => {
    expect(isPasswordValid('')).toBe(false)
  })
})

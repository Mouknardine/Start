import { describe, it, expect } from 'vitest'
import { safeNextPath } from '@/lib/safe-redirect'

const ORIGIN = 'https://artisano.ch'

describe('safeNextPath', () => {
  it('garde les chemins internes', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard')
    expect(safeNextPath('/demande?artisan=abc&heure=9h00')).toBe('/demande?artisan=abc&heure=9h00')
  })

  it('refuse les URL externes et leurs variantes', () => {
    for (const evil of ['https://evil.com', '//evil.com', '/\\evil.com', '/\\/evil.com', '/\t/evil.com', 'evil.com']) {
      const safe = safeNextPath(evil)
      expect(safe).toBe('/')
      expect(new URL(safe, ORIGIN).origin).toBe(ORIGIN)
    }
  })

  it('utilise le repli donné', () => {
    expect(safeNextPath(null, '/client')).toBe('/client')
    expect(safeNextPath('//evil.com', '/client')).toBe('/client')
  })

  it('aucun chemin accepté ne sort du domaine', () => {
    for (const p of ['/', '/a/b', '/a\\b', '/?next=//evil.com']) {
      expect(new URL(safeNextPath(p), ORIGIN).origin).toBe(ORIGIN)
    }
  })
})

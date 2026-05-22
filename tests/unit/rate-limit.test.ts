import { describe, it, expect } from 'vitest'
import { createLimiter } from '@/lib/rate-limit'

describe('createLimiter', () => {
  it('autorise les requêtes dans la limite', () => {
    const limiter = createLimiter({ name: 'test-1', windowMs: 1000, max: 3 })
    expect(limiter.check('ip1').allowed).toBe(true)
    expect(limiter.check('ip1').allowed).toBe(true)
    expect(limiter.check('ip1').allowed).toBe(true)
  })

  it('bloque la 4e requête dans la même fenêtre', () => {
    const limiter = createLimiter({ name: 'test-2', windowMs: 1000, max: 3 })
    limiter.check('ip2')
    limiter.check('ip2')
    limiter.check('ip2')
    const r = limiter.check('ip2')
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBeGreaterThan(0)
  })

  it('isole les clés différentes', () => {
    const limiter = createLimiter({ name: 'test-3', windowMs: 1000, max: 1 })
    expect(limiter.check('ip-a').allowed).toBe(true)
    expect(limiter.check('ip-b').allowed).toBe(true)
    expect(limiter.check('ip-a').allowed).toBe(false)
  })

  it('expose le compteur remaining', () => {
    const limiter = createLimiter({ name: 'test-4', windowMs: 1000, max: 5 })
    expect(limiter.check('ip4').remaining).toBe(4)
    expect(limiter.check('ip4').remaining).toBe(3)
  })
})

import { describe, it, expect } from 'vitest'
import { createLimiter } from '@/lib/rate-limit'

/**
 * Sans SUPABASE_SERVICE_ROLE_KEY (cas des tests), createLimiter() utilise le
 * repli mémoire : ces tests couvrent la logique de fenêtre/compteur.
 * La version DB (check_rate_limit) est testée côté migration 0014.
 */
describe('createLimiter (repli mémoire)', () => {
  it('autorise les requêtes dans la limite', async () => {
    const limiter = createLimiter({ name: 'test-1', windowMs: 1000, max: 3 })
    expect((await limiter.check('ip1')).allowed).toBe(true)
    expect((await limiter.check('ip1')).allowed).toBe(true)
    expect((await limiter.check('ip1')).allowed).toBe(true)
  })

  it('bloque la 4e requête dans la même fenêtre', async () => {
    const limiter = createLimiter({ name: 'test-2', windowMs: 1000, max: 3 })
    await limiter.check('ip2')
    await limiter.check('ip2')
    await limiter.check('ip2')
    const r = await limiter.check('ip2')
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBeGreaterThan(0)
  })

  it('isole les clés différentes', async () => {
    const limiter = createLimiter({ name: 'test-3', windowMs: 1000, max: 1 })
    expect((await limiter.check('ip-a')).allowed).toBe(true)
    expect((await limiter.check('ip-b')).allowed).toBe(true)
    expect((await limiter.check('ip-a')).allowed).toBe(false)
  })

  it('expose le compteur remaining', async () => {
    const limiter = createLimiter({ name: 'test-4', windowMs: 1000, max: 5 })
    expect((await limiter.check('ip4')).remaining).toBe(4)
    expect((await limiter.check('ip4')).remaining).toBe(3)
  })

  it('checkSync : même logique, synchrone', () => {
    const limiter = createLimiter({ name: 'test-5', windowMs: 1000, max: 1 })
    expect(limiter.checkSync('ip5').allowed).toBe(true)
    expect(limiter.checkSync('ip5').allowed).toBe(false)
  })
})

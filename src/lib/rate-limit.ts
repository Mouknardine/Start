/**
 * Rate limiter en mémoire (par instance serveur).
 *
 * Limitation : ne fonctionne que sur un seul serveur Node. Pour un déploiement
 * multi-instance (ex: Vercel multi-régions), il faudra migrer vers Upstash
 * Redis ou similaire. Suffisant pour démarrer en bêta.
 *
 * Usage :
 *   const limiter = createLimiter({ windowMs: 60_000, max: 5 })
 *   const allowed = limiter.check(key) // true / false
 */

type Bucket = { count: number; resetAt: number }
const stores = new Map<string, Map<string, Bucket>>()

export type LimiterConfig = {
  /** Identifiant unique du limiter (par ex: "signup", "demande") */
  name: string
  /** Fenêtre en millisecondes */
  windowMs: number
  /** Nombre max d'appels autorisés dans la fenêtre */
  max: number
}

export function createLimiter(config: LimiterConfig) {
  const { name, windowMs, max } = config
  if (!stores.has(name)) stores.set(name, new Map())
  const store = stores.get(name)!

  // Cleanup périodique pour éviter une fuite mémoire infinie
  if (Math.random() < 0.01) {
    const now = Date.now()
    for (const [key, bucket] of store) {
      if (bucket.resetAt < now) store.delete(key)
    }
  }

  return {
    /**
     * Renvoie { allowed, retryAfterSec } pour la clé donnée.
     * Incrémente le compteur si autorisé.
     */
    check(key: string): { allowed: boolean; retryAfterSec: number; remaining: number } {
      const now = Date.now()
      const existing = store.get(key)

      if (!existing || existing.resetAt < now) {
        store.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, retryAfterSec: 0, remaining: max - 1 }
      }

      if (existing.count >= max) {
        return {
          allowed: false,
          retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
          remaining: 0,
        }
      }

      existing.count += 1
      return { allowed: true, retryAfterSec: 0, remaining: max - existing.count }
    },
  }
}

/**
 * Extrait une clé d'identification depuis une Request.
 * Priorise : IP (via headers Vercel/proxies) → fallback "anonymous".
 */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'anonymous'
}

// ============================================================================
// LIMITERS PRÉCONFIGURÉS
// ============================================================================

export const emailLimiter = createLimiter({
  name: 'email',
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 emails/min par IP
})

export const accountActionLimiter = createLimiter({
  name: 'account',
  windowMs: 60 * 1000,
  max: 3, // 3 actions sensibles (delete, etc.) par minute
})

// Limites suggérées pour intégration future côté Edge Function / API routes :
//  - signup : 3 par heure par IP
//  - login  : 5 par 5 minutes par IP
//  - demande: 10 par jour par utilisateur

/**
 * Rate limiter partagé entre toutes les instances serveur.
 *
 * Stockage : table `rate_limits` + fonction `check_rate_limit()` (migration
 * 0014), appelées avec la clé service_role. Un seul aller-retour DB par
 * vérification, atomique (UPSERT).
 *
 * Repli : si la DB est injoignable ou la clé service absente (tests unitaires,
 * dev sans .env), on retombe sur un compteur en mémoire — suffisant pour un
 * seul processus, inopérant entre lambdas Vercel (d'où la version DB).
 *
 * Usage :
 *   const limiter = createLimiter({ name: 'signup', windowMs: 60_000, max: 5 })
 *   const { allowed, retryAfterSec } = await limiter.check(getClientKey(request))
 */

import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'

export type LimiterConfig = {
  /** Identifiant unique du limiter (préfixe des clés) */
  name: string
  /** Fenêtre en millisecondes */
  windowMs: number
  /** Nombre max d'appels autorisés dans la fenêtre */
  max: number
}

export type LimitResult = {
  allowed: boolean
  retryAfterSec: number
  remaining: number
}

// ============================================================================
// REPLI MÉMOIRE (par processus)
// ============================================================================

type Bucket = { count: number; resetAt: number }
const memoryStores = new Map<string, Map<string, Bucket>>()

function memoryCheck(config: LimiterConfig, key: string): LimitResult {
  const { name, windowMs, max } = config
  if (!memoryStores.has(name)) memoryStores.set(name, new Map())
  const store = memoryStores.get(name)!
  const now = Date.now()

  // Nettoyage opportuniste pour éviter une fuite mémoire
  if (Math.random() < 0.01) {
    for (const [k, bucket] of store) {
      if (bucket.resetAt < now) store.delete(k)
    }
  }

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
}

// ============================================================================
// LIMITER
// ============================================================================

export function createLimiter(config: LimiterConfig) {
  const { name, windowMs, max } = config

  return {
    /**
     * Vérifie et incrémente le compteur pour la clé donnée.
     * Ne lève jamais : en cas d'erreur DB on log et on utilise le repli mémoire
     * (fail-open contrôlé — la disponibilité prime sur la stricte limitation).
     */
    async check(key: string): Promise<LimitResult> {
      const admin = createServiceClient()
      if (!admin) return memoryCheck(config, key)

      try {
        const { data, error } = await admin.rpc('check_rate_limit', {
          p_key: `${name}:${key}`,
          p_window_ms: windowMs,
          p_max: max,
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row) throw new Error('check_rate_limit : réponse vide')
        return {
          allowed: Boolean(row.allowed),
          retryAfterSec: Number(row.retry_after_sec) || 0,
          remaining: Number(row.remaining) || 0,
        }
      } catch (e) {
        logger.warn(`Rate limit DB indisponible (${name}) — repli mémoire :`, e)
        return memoryCheck(config, key)
      }
    },

    /** Variante synchrone, mémoire uniquement (tests, scripts). */
    checkSync(key: string): LimitResult {
      return memoryCheck(config, key)
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

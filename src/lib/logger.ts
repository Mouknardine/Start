/**
 * Logger centralisé.
 *
 * Comportement :
 *  - En dev : log dans la console
 *  - En prod : silencieux côté console, mais envoie les erreurs à Sentry
 *    si la DSN est configurée. Sans DSN, complètement silencieux.
 */

const isDev = process.env.NODE_ENV !== 'production'

/**
 * Envoie l'erreur à Sentry en prod (no-op si Sentry pas configuré).
 * Import dynamique pour éviter de bundler Sentry quand pas utilisé.
 */
function reportToSentry(level: 'error' | 'warning', args: unknown[]) {
  if (isDev) return
  // Lazy import — ne charge Sentry que si on en a besoin
  import('@sentry/nextjs').then((Sentry) => {
    const first = args[0]
    if (first instanceof Error) {
      Sentry.captureException(first, { extra: { args: args.slice(1) } })
    } else {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      Sentry.captureMessage(msg, level)
    }
  }).catch(() => {
    // Sentry non installé : silencieux
  })
}

export const logger = {
  error: (...args: unknown[]) => {
    if (isDev) console.error(...args)
    else reportToSentry('error', args)
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args)
    else reportToSentry('warning', args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args)
    // info : pas envoyé à Sentry (trop verbeux)
  },
}

import * as Sentry from '@sentry/nextjs'

// Sentry est complètement optionnel : si la DSN n'est pas définie,
// rien ne s'initialise et logger.error() reste silencieux en prod.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1, // 10% des transactions tracées
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0, // Replay des sessions où une erreur survient
    // Filtre : ne pas envoyer les erreurs courantes/inutiles
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  })
}

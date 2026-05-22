import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const supabaseHost = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) return ''
    return new URL(url).host
  } catch {
    return ''
  }
})()

// Content-Security-Policy : whitelist stricte des sources autorisées.
// Note : 'unsafe-inline' sur scripts est nécessaire pour Next.js (hydration)
// et ses runtime helpers. À durcir plus tard avec nonces.
const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob: https://${supabaseHost} https://*.supabase.co`,
  `connect-src 'self' https://${supabaseHost} https://*.supabase.co wss://${supabaseHost} wss://*.supabase.co https://api.resend.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].filter(Boolean).join('; ')

const securityHeaders = [
  // Empêche le site d'être affiché dans une iframe (anti clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Force le navigateur à respecter le Content-Type renvoyé
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Force HTTPS pendant 2 ans + sous-domaines
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Empêche la fuite de l'URL complète vers les sites tiers
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Désactive les API navigateur sensibles non utilisées
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
  // Anti-XSS legacy (peu utile aujourd'hui mais harmless)
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Content-Security-Policy
  { key: 'Content-Security-Policy', value: cspDirectives },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'qonowxahjffayegvyqmq.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Tous les paths sauf API (les routes API peuvent retourner du JSON sans CSP HTML)
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
};

// Wrap avec Sentry seulement si on a un DSN — sinon export direct
const hasSentry = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)

export default hasSentry
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      tunnelRoute: '/monitoring',
      disableLogger: true,
    })
  : nextConfig;

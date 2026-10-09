import type { Metadata, Viewport } from 'next'
import { DM_Sans, Sora } from 'next/font/google'
import Script from 'next/script'
import CookieConsent from '@/components/CookieConsent'
import Analytics from '@/components/Analytics'
import { getSiteUrl, SITE_DESCRIPTION, SITE_DESCRIPTION_SHORT } from '@/lib/site'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Artisano — Trouve ton artisan en 2 clics',
    template: '%s | Artisano',
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(getSiteUrl()),
  openGraph: {
    type: 'website',
    locale: 'fr_CH',
    siteName: 'Artisano',
    title: 'Artisano — Trouve ton artisan en 2 clics',
    description: SITE_DESCRIPTION_SHORT,
    url: getSiteUrl(),
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
}

// viewport-fit=cover : les barres fixées en bas (tableau de bord) peuvent
// réserver la zone de l'indicateur d'accueil via env(safe-area-inset-bottom).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E8700A',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" className={`${dmSans.variable} ${sora.variable}`}>
      <body>
        {children}
        <CookieConsent />
        <Analytics />
        <Script id="sw-register" strategy="afterInteractive">
          {`if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}`}
        </Script>
      </body>
    </html>
  )
}

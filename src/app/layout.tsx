import type { Metadata } from 'next'
import { DM_Sans, Sora } from 'next/font/google'
import Script from 'next/script'
import CookieConsent from '@/components/CookieConsent'
import Analytics from '@/components/Analytics'
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
  description: 'Trouve un plombier, électricien ou serrurier près de chez toi dans le canton de Vaud. Des vrais avis, des vrais pros, zéro prise de tête.',
  metadataBase: new URL('https://artisano.ch'),
  openGraph: {
    type: 'website',
    locale: 'fr_CH',
    siteName: 'Artisano',
    title: 'Artisano — Trouve ton artisan en 2 clics',
    description: 'Trouve un plombier, électricien ou serrurier près de chez toi dans le canton de Vaud.',
    url: 'https://artisano.ch',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  other: {
    'theme-color': '#E8700A',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${sora.variable}`}>
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

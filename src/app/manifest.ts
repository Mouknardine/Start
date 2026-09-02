import type { MetadataRoute } from 'next'
import { COVERAGE_LABEL } from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Artisano',
    short_name: 'Artisano',
    description: `Trouve ton artisan en 2 clics en ${COVERAGE_LABEL}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#FAFAF8',
    theme_color: '#E8700A',
    orientation: 'portrait',
    lang: 'fr',
    categories: ['business', 'lifestyle'],
    icons: [
      {
        src: '/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Rechercher un artisan',
        short_name: 'Recherche',
        url: '/recherche',
      },
      {
        name: 'Mon tableau de bord',
        short_name: 'Dashboard',
        url: '/dashboard',
      },
    ],
  }
}

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/mon-profil', '/client', '/admin', '/api/'],
      },
    ],
    sitemap: 'https://artisano.ch/sitemap.xml',
  }
}

import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site'

/**
 * Sitemap dynamique : inclut les pages statiques + tous les profils artisans
 * publiés. Régénéré à chaque requête (revalidate via ISR si on veut cache).
 */

const BASE_URL = getSiteUrl()

// Cache 1h — évite de retaper la DB à chaque crawl Google
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/recherche`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/inscription`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/inscription-client`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/connexion`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/cgu`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/confidentialite`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/mentions-legales`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Pages dynamiques : tous les profils artisans
  let artisanPages: MetadataRoute.Sitemap = []
  try {
    const supabase = await createClient()
    const { data: artisans } = await supabase
      .from('artisans')
      .select('id, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(50000) // garde-fou

    artisanPages = (artisans || []).map((a) => ({
      url: `${BASE_URL}/artisan/${a.id}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : (a.created_at ? new Date(a.created_at) : new Date()),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch {
    // Si la DB est down au moment du sitemap, on renvoie au moins les pages statiques
  }

  return [...staticPages, ...artisanPages]
}

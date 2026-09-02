import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Artisan, Avis } from '@/lib/supabase/helpers'
import ArtisanProfileClient from './ArtisanProfileClient'
import { DEFAULT_ZONE_LABEL } from '@/lib/site'

type Params = Promise<{ id: string }>

async function getArtisanData(id: string) {
  const supabase = await createClient()
  // Vue publique sans colonnes bancaires (sécurité)
  const { data: artisan } = await supabase
    .from('artisans_public')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!artisan) return null

  const { data: reviews } = await supabase
    .from('avis')
    .select('*')
    .eq('artisan_id', id)
    .order('created_at', { ascending: false })

  return {
    profile: artisan as Artisan,
    reviews: (reviews || []) as Avis[],
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const data = await getArtisanData(id)

  if (!data) {
    return {
      title: 'Artisan introuvable — Artisano',
      robots: { index: false, follow: false },
    }
  }

  const { profile, reviews } = data
  const name = profile.entreprise || `${profile.prenom || ''} ${profile.nom || ''}`.trim() || 'Artisan'
  const metier = profile.metier || 'Artisan'
  const zone = (profile.zones && profile.zones[0]) || DEFAULT_ZONE_LABEL
  const avg = reviews.length > 0
    ? Math.round(reviews.reduce((s, r) => s + (r.note || 0), 0) / reviews.length * 10) / 10
    : null

  // Title sans "| Artisano" : le template du layout l'ajoute déjà
  const titleShort = `${name} — ${metier} à ${zone}`
  const titleFull = `${titleShort} | Artisano`
  const description = profile.description
    ? profile.description.slice(0, 160)
    : `${metier} ${name} basé à ${zone}. ${reviews.length} avis vérifiés${avg ? ` · ${avg}/5` : ''}. Contactez-le directement sur Artisano.`

  return {
    title: titleShort, // passe par template '%s | Artisano'
    description,
    openGraph: {
      title: titleFull,
      description,
      type: 'profile',
      // Pas d'override d'images : Next utilise auto l'opengraph-image.tsx généré
    },
    twitter: {
      card: 'summary_large_image',
      title: titleFull,
      description,
    },
    alternates: {
      canonical: `/artisan/${profile.id}`,
    },
  }
}

export default async function ArtisanProfilePage({ params }: { params: Params }) {
  const { id } = await params
  const data = await getArtisanData(id)

  if (!data) notFound()

  return (
    <ArtisanProfileClient
      artisanId={id}
      initialProfile={data.profile}
      initialReviews={data.reviews}
    />
  )
}

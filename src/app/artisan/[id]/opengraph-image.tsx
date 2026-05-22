import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'

/**
 * Open Graph image dynamique pour chaque profil artisan.
 * Format 1200×630.
 * Force runtime Node car @supabase/ssr utilise cookies().
 */

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
export const runtime = 'nodejs'

type Params = Promise<{ id: string }>

export default async function Image({ params }: { params: Params }) {
  const { id } = await params

  let name = 'Artisan'
  let metier = ''
  let zone = ''
  let avatarUrl = ''
  let avgRating: number | null = null
  let reviewCount = 0

  try {
    const supabase = await createClient()
    const { data: artisan } = await supabase
      .from('artisans_public')
      .select('entreprise, prenom, nom, metier, zones, avatar_url')
      .eq('id', id)
      .maybeSingle<{
        entreprise: string | null
        prenom: string | null
        nom: string | null
        metier: string | null
        zones: string[] | null
        avatar_url: string | null
      }>()

    if (artisan) {
      name = artisan.entreprise || `${artisan.prenom || ''} ${artisan.nom || ''}`.trim() || 'Artisan'
      metier = artisan.metier || ''
      zone = (artisan.zones && artisan.zones[0]) || ''
      avatarUrl = artisan.avatar_url || ''
    }

    const { data: avis } = await supabase
      .from('avis')
      .select('note')
      .eq('artisan_id', id)

    if (avis && avis.length > 0) {
      reviewCount = avis.length
      avgRating = Math.round((avis.reduce((s, a) => s + (a.note || 0), 0) / avis.length) * 10) / 10
    }
  } catch {
    // pas grave, fallback générique
  }

  const initials = name
    .split(/[\s&]+/)
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#1A1A1A',
          padding: 60,
          color: '#FFFFFF',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 28,
            fontWeight: 800,
          }}
        >
          <span>artisano</span>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#E8700A',
              marginLeft: 4,
            }}
          />
        </div>

        {/* Bloc principal */}
        <div
          style={{
            display: 'flex',
            gap: 40,
            alignItems: 'center',
            marginTop: 80,
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={180}
              height={180}
              style={{
                borderRadius: 24,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                width: 180,
                height: 180,
                borderRadius: 24,
                background: '#E8700A',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 64,
                fontWeight: 800,
                color: '#FFFFFF',
              }}
            >
              {initials}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {metier && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 22,
                  color: '#E8700A',
                  fontWeight: 700,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                {metier.toUpperCase()}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                fontSize: 64,
                fontWeight: 800,
                color: '#FFFFFF',
              }}
            >
              {name}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 24,
                marginTop: 12,
                fontSize: 22,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              {avgRating !== null && (
                <div style={{ display: 'flex', color: '#F0B429', fontWeight: 700 }}>
                  ★ {avgRating.toFixed(1)} ({reviewCount} avis)
                </div>
              )}
              {zone && <div style={{ display: 'flex' }}>{zone}</div>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            fontSize: 20,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          artisano.ch — Trouve ton artisan en 2 clics
        </div>
      </div>
    ),
    { ...size }
  )
}

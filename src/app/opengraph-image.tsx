import { ImageResponse } from 'next/og'

/**
 * Open Graph image pour la page d'accueil.
 * 1200×630, image générique de la plateforme.
 */

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#1A1A1A',
          color: '#FFFFFF',
          padding: 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 80,
            fontWeight: 800,
            marginBottom: 32,
          }}
        >
          <span>artisano</span>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: '#E8700A',
              marginLeft: 8,
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 44,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
            marginBottom: 24,
          }}
        >
          Trouve ton artisan en 2 clics
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 24,
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          Plombiers · Électriciens · Serruriers · Chauffagistes
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 18,
            color: '#E8700A',
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          SUISSE ROMANDE
        </div>
      </div>
    ),
    { ...size }
  )
}

import { test, expect } from '@playwright/test'

/**
 * Tests des API routes — validation, rate limit, auth.
 * Ces tests ne nécessitent pas de DB en état particulier : ils vérifient
 * juste que les endpoints réagissent correctement aux mauvais inputs.
 */

test.describe('API /api/demandes', () => {
  test('rejette une demande sans body', async ({ request }) => {
    const res = await request.post('/api/demandes', { data: {} })
    expect(res.status()).toBe(400)
  })

  test('rejette une demande avec artisan_id non-UUID', async ({ request }) => {
    const res = await request.post('/api/demandes', {
      data: {
        artisan_id: 'pas-un-uuid',
        client_nom: 'Jean Dupont',
        client_telephone: '0791234567',
        type: 'message',
        message: 'Salut, peux-tu venir ?',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('rejette une demande avec message trop long', async ({ request }) => {
    const res = await request.post('/api/demandes', {
      data: {
        artisan_id: '00000000-0000-0000-0000-000000000000',
        client_nom: 'Jean',
        client_telephone: '0791234567',
        type: 'message',
        message: 'x'.repeat(6000),
      },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('API /api/messages', () => {
  test('refuse les non-authentifiés', async ({ request }) => {
    const res = await request.post('/api/messages', {
      data: {
        demande_id: '00000000-0000-0000-0000-000000000000',
        content: 'Hello',
      },
    })
    // Soit 400 (validation), soit 401 (auth) → les 2 sont OK car on n'a pas de session
    expect([400, 401]).toContain(res.status())
  })
})

test.describe('API /api/verify-ide', () => {
  test('rejette un IDE au mauvais format', async ({ request }) => {
    const res = await request.post('/api/verify-ide', {
      data: { ide: 'PAS_UN_IDE', mode: 'check' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejette un IDE avec mauvais checksum', async ({ request }) => {
    const res = await request.post('/api/verify-ide', {
      data: { ide: 'CHE-123.456.789', mode: 'check' }, // checksum invalide
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('API /api/account/delete', () => {
  test('refuse les non-authentifiés', async ({ request }) => {
    const res = await request.delete('/api/account/delete')
    expect(res.status()).toBe(401)
  })
})

test.describe('API /api/account/export', () => {
  test('refuse les non-authentifiés', async ({ request }) => {
    const res = await request.get('/api/account/export')
    expect(res.status()).toBe(401)
  })
})

test.describe('API /api/artisans/search', () => {
  test('accepte une recherche sans filtres', async ({ request }) => {
    const res = await request.get('/api/artisans/search')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
  })

  test('accepte des filtres', async ({ request }) => {
    const res = await request.get('/api/artisans/search?metier=Plombier&urgence=1&pageSize=5')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('ne renvoie jamais de colonnes bancaires', async ({ request }) => {
    const res = await request.get('/api/artisans/search?pageSize=5')
    const body = await res.json()
    for (const item of body.items || []) {
      expect(item).not.toHaveProperty('bank_iban')
      expect(item).not.toHaveProperty('bank_bic')
      expect(item).not.toHaveProperty('bank_titulaire')
      expect(item).not.toHaveProperty('bank_adresse')
      expect(item).not.toHaveProperty('ide_number') // ide_number reste privé
    }
  })
})

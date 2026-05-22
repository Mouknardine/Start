import { test, expect } from '@playwright/test'

/**
 * Tests des pages publiques (visiteur non connecté).
 * Vérifient que les pages se chargent, que les éléments clés sont présents,
 * et que la sécurité fonctionne (admin redirige vers connexion).
 */

test.describe('Pages publiques', () => {
  test('accueil charge et affiche le hero', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText(['artisan', 'clic'])
    // Stats hero présentes (dynamiques depuis la DB)
    await expect(page.locator('text=/artisans inscrits/i')).toBeVisible()
  })

  test('page recherche charge et affiche les artisans', async ({ page }) => {
    await page.goto('/recherche')
    // Filtres présents
    await expect(page.locator('button:has-text("Tous")')).toBeVisible()
    await expect(page.locator('button:has-text("Urgence")')).toBeVisible()
    // Pas d'option "Proximité" (retirée car factice)
    const sortOptions = page.locator('select option')
    await expect(sortOptions.filter({ hasText: 'Proximité' })).toHaveCount(0)
  })

  test('page CGU accessible', async ({ page }) => {
    await page.goto('/cgu')
    await expect(page.locator('h1')).toContainText('Conditions')
  })

  test('page confidentialité accessible', async ({ page }) => {
    await page.goto('/confidentialite')
    await expect(page.locator('h1')).toContainText('Confidentialité')
  })

  test('page mentions légales affiche la bannière "en cours de rédaction"', async ({ page }) => {
    await page.goto('/mentions-legales')
    await expect(page.locator('text=/en cours de rédaction/i')).toBeVisible()
  })

  test('robots.txt présent et bloque les pages privées', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('Disallow: /admin')
    expect(text).toContain('Disallow: /dashboard')
    expect(text).toContain('Disallow: /client')
  })

  test('sitemap.xml présent et bien formé', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('<urlset')
    expect(text).toContain('artisano.ch')
  })
})

test.describe('Sécurité', () => {
  test('/admin redirige vers /connexion quand non connecté', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('/dashboard redirige vers /connexion quand non connecté', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('/mon-profil redirige vers /connexion quand non connecté', async ({ page }) => {
    await page.goto('/mon-profil')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('headers de sécurité présents sur l\'accueil', async ({ request }) => {
    const res = await request.get('/')
    const headers = res.headers()
    expect(headers['content-security-policy']).toBeTruthy()
    expect(headers['strict-transport-security']).toBeTruthy()
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBeTruthy()
    expect(headers['permissions-policy']).toBeTruthy()
  })
})

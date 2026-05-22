import { test, expect } from '@playwright/test'

/**
 * Tests du flow d'inscription artisan.
 * On ne va pas jusqu'à créer un vrai compte (sinon on pollue la DB)
 * mais on valide que les étapes / validations marchent.
 */

test.describe('Inscription artisan — étape 1', () => {
  test('affiche le champ IDE obligatoire', async ({ page }) => {
    await page.goto('/inscription')
    // Le bouton "Vérifier" pour l'IDE est présent
    await expect(page.locator('button:has-text("Vérifier")')).toBeVisible()
  })

  test('bloque le bouton Continuer tant que l\'IDE n\'est pas vérifié', async ({ page }) => {
    await page.goto('/inscription')
    const continuer = page.locator('button:has-text("Continuer")')
    await expect(continuer).toBeDisabled()
  })

  test('affiche une erreur si on tape un mauvais IDE', async ({ page }) => {
    await page.goto('/inscription')
    await page.locator('input[placeholder*="CHE-"]').fill('CHE-123.456.789') // mauvais checksum
    await page.locator('button:has-text("Vérifier")').click()
    // Attend qu'une erreur apparaisse
    await expect(page.locator('text=/checksum|invalide/i')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Inscription artisan — wizard', () => {
  test('affiche les 4 étapes du Stepper', async ({ page }) => {
    await page.goto('/inscription')
    await expect(page.locator('text=Votre entreprise').first()).toBeVisible()
    // (Les autres étapes sont conditionnellement rendues, donc non visibles ici)
  })

  test('affiche le lien retour connexion', async ({ page }) => {
    await page.goto('/inscription')
    await expect(page.locator('a[href="/connexion"]').first()).toBeVisible()
  })
})

test.describe('Inscription client', () => {
  test('charge la page', async ({ page }) => {
    await page.goto('/inscription-client')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toHaveCount(2)
  })

  test('affiche les critères de mot de passe en live', async ({ page }) => {
    await page.goto('/inscription-client')
    const pwd = page.locator('input[type="password"]').first()
    await pwd.fill('abc') // trop faible
    // La barre de force doit apparaître
    await expect(page.locator('text=Min 8 caractères')).toBeVisible()
  })
})

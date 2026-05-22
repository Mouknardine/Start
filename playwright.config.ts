import { defineConfig, devices } from '@playwright/test'

/**
 * Configuration Playwright pour les tests E2E.
 * Lance le serveur dev automatiquement si pas déjà en cours.
 *
 * Run : `npm run test:e2e`
 * UI mode : `npx playwright test --ui`
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // les tests partagent un état DB (artisans, demandes)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // séquentiel pour éviter les conflits DB
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

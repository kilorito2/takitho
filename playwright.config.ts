import { defineConfig, devices } from '@playwright/test'

const DEV_PORT = 5173
const PREVIEW_PORT = 4173

// Public build-time variables for tests: they point at the mock backend (tests/e2e/support/backend.ts).
const PUBLIC_ENV = {
  VITE_SUPABASE_URL: 'https://e2e.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_key_000000',
  VITE_CLOUDINARY_CLOUD_NAME: 'tzfvhzgb',
  VITE_SITE_URL: 'http://localhost:4173',
}

export default defineConfig({
  testDir: './tests/e2e',
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    // The production build registers a service worker; its requests would bypass the mocked backend (page.route).
    serviceWorkers: 'block',
  },
  projects: [
    {
      // axe over every public route; uses the dev server so the dev-only /_kit gallery is included.
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      // The dev server compiles on demand: the first hits of a cold run are slow.
      timeout: 90_000,
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${DEV_PORT}`, channel: 'chrome' },
    },
    {
      name: 'e2e',
      // Flows with two browser pages (kitchen + customer) share one CPU with the build: give them room.
      timeout: 60_000,
      testIgnore: /a11y\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PREVIEW_PORT}`, channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      env: PUBLIC_ENV,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npm run build && npm run preview`,
      env: PUBLIC_ENV,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})

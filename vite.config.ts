import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // ADR-0011: the app shell and the menu work with a bad connection, but an order is never queued offline
    // (prices, hours and availability are the server's call), so only GET reads of public catalogue data are cached.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Takitho · Tacos de barrio',
        short_name: 'Takitho',
        description: 'Pedí tacos, quesabirria y más. Retiro, delivery o en tu mesa.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FFF4E0',
        theme_color: '#FFF4E0',
        icons: [
          { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/cocina\.webmanifest$/, /^\/brand\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'menu-photos',
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern:
              /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(categories|products|modifier_groups|product_modifier_groups|combo_items|opening_hours|delivery_zones)\?/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'menu-data',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    globals: false,
    css: false,
    // PGlite (WASM Postgres) is heavy to boot: cap concurrency so workers don't starve each other.
    maxWorkers: 3,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.tsx'],
        },
      },
      {
        // Pure logic, Edge Function handlers and SQL: no DOM needed, and files don't need isolated workers.
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          isolate: false,
          include: [
            'src/**/*.test.ts',
            'supabase/functions/**/*.test.ts',
            'tests/sql/**/*.test.ts',
            'tests/functions/**/*.test.ts',
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/types/database.ts', 'src/main.tsx', 'src/**/*.d.ts'],
      thresholds: {
        // CONSTRAINTS.md §3: the pure core must stay ≥ 95 %.
        'src/lib/{pricing,hours,orderStatus,money,phone}.ts': {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
        },
      },
    },
  },
})

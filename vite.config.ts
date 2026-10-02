/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// The site is served from the root of a custom domain, so base defaults to "/".
// BASE_PATH remains overridable for serving from a sub-path if that changes.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    vue(),
    // Installable, offline-capable PWA. The generated service worker precaches the whole
    // build (there is no backend to talk to). A newer build waits until the user accepts
    // it from the `PwaStatus` toast, so a reload never swaps the app mid-performance.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: "Conway's Sequencer",
        short_name: 'Conway Seq',
        description:
          "Binary gate sequencer for the Nervous Squirrel Conway's Game eurorack module, by Aleph Void, LLC.",
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'any',
        categories: ['music', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Control the page from the first visit so runtime caching (fonts) starts right away.
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The social-media preview card is only ever fetched by link scrapers; precaching it
        // would just make every install download a large PNG the app never shows.
        globIgnores: ['**/og-image.png'],
        // Web fonts come from Google Fonts: cache the stylesheet and font files once seen so
        // the app keeps its typography offline (it falls back to system fonts until then).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts', 'src/**/*.spec.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
})

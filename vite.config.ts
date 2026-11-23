import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' lets the app choose a safe moment to reload (see src/lib/updates.ts)
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Zakar',
        short_name: 'Zakar',
        description: 'Write it down. Remember. Offline-first notebooks, sections and pages.',
        theme_color: '#FBFBFA',
        background_color: '#24473B',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        cleanupOutdatedCaches: true,
        // Keep images embedded from other sites available offline once they've been seen.
        runtimeCaching: [{
          urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin,
          handler: 'CacheFirst',
          options: {
            cacheName: 'note-images',
            expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [0, 200] },
          },
        }],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
});

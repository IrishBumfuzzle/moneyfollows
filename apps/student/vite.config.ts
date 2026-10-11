import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Offline-first (CLAUDE.md 1): a service worker precaches the app shell, every pixel-art PNG
// and the woff2 fonts, so after one online visit the game loads and plays in airplane mode.
// File names (sw.js, registerSW.js, manifest.webmanifest) match the headers in vercel.json.
// Backend calls are never cached: events queue in IndexedDB instead (src/api/backend.ts).
export default defineConfig({
  // .env lives at the repo root (.env.example), shared with the dashboard and scripts.
  envDir: '../..',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'MoneyFollows',
        short_name: 'MoneyFollows',
        description: 'Run a life, one week at a time, and learn how money works.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // The letterbox purple behind every stage (main.css, onboarding).
        theme_color: '#2b1b3d',
        background_color: '#2b1b3d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The fonts ship as woff2 and woff; every browser that runs a service worker reads woff2.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // world.png (the map) is the biggest file; keep headroom so it is never skipped.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          // Supabase (join_class, push_events, class_status): always the network, never a cache.
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});

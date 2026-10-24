import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    alphaTab(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ScaleUp',
        short_name: 'ScaleUp',
        description: 'ScaleUp — chord builder, progressions, and scale visualizer',
        // Paper chrome — cobalt is reserved for the mark itself, never the
        // PWA splash / address bar.
        theme_color: '#ECEAE3',
        background_color: '#ECEAE3',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Without these, a freshly deployed service worker sits in "waiting"
        // until every tab closes — users kept getting the previous build from
        // cache (e.g. the email-confirmation link opened a stale app with no
        // Supabase config baked in). Take over immediately instead.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // The Mac app's sign-in bridge is a page of its own, never the SPA shell.
        navigateFallbackDenylist: [/^\/desktop-auth/],
      },
    }),
  ],
});

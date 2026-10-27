import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Chess Coach',
        short_name: 'Chess Coach',
        description: 'Stop hanging pieces: daily puzzles, drills from your own games, and a human-like bot with a blunder alarm.',
        display: 'standalone',
        start_url: '/',
        background_color: '#131615',
        theme_color: '#2a7254',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline: code, engine, bot model, onnxruntime, puzzles.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,wasm,onnx,tsv,webmanifest}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});

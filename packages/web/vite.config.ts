/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// PWA desactivada temporalmente — ver comentario en plugins. Para reactivar:
// 1) descomentar el import y el bloque VitePWA, 2) subir
// maximumFileSizeToCacheInBytes (p. ej. 4 MiB) o code-splittear el bundle.
// import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // PWA TEMPORALMENTE DESACTIVADA: el bundle index.js pasó de 3 MiB
    // (3.19 MB tras añadir la pestaña Tablero) y workbox aborta el build
    // cuando un asset excede maximumFileSizeToCacheInBytes. Reactivar
    // subiendo el límite (p. ej. 4 MiB) o code-splitting el bundle.
    // ...(react() sigue activo; solo se apaga el service worker).
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Listen on all loopback interfaces — the Spotify dashboard redirect URI
    // uses 127.0.0.1 while the rest of the app uses localhost; both must work.
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3005',
        ws: true,
      },
    },
  },
});

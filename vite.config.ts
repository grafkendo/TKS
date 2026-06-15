// ============================================================================
// Vite config — multi-page setup.
//
// Pages:
//   src/local/index.html  → 2D hot-seat (rules sandbox)
//   src/3d/index.html     → 3D mech demo (the new direction)
//
// Build output:
//   dist/local/  (after `npm run build:local`)
//
// Dev server lists both pages on the index.
// ============================================================================

import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = resolve(__dirname, 'src');

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist/local'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        local: resolve(root, 'local/index.html'),
        '3d':   resolve(root, '3d/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: '/',
    host: '127.0.0.1',
  },
  test: {
    include: ['**/*.test.ts'],
    root,
    environment: 'node',
    globals: false,
  },
});

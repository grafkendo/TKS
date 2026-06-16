import { defineConfig } from 'vite';
import { resolve } from 'path';

/** Bundles the co-op rules engine for Node (`server/coopEngine.js`). */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/3d/coop/index.ts'),
      formats: ['es'],
      fileName: 'coopEngine',
    },
    outDir: resolve(__dirname, 'server'),
    emptyOutDir: false,
    rollupOptions: {
      external: [],
    },
  },
});

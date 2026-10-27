import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../packages/client');

export default defineConfig({
  root: clientRoot,
  plugins: [
    react(),
    visualizer({
      filename: path.resolve(here, 'results/bundle-treemap.html'),
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
    }),
    visualizer({
      filename: path.resolve(here, 'results/bundle-stats.json'),
      template: 'raw-data',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(clientRoot, 'src'),
    },
  },
  build: {
    outDir: path.resolve(here, 'results/bundle-dist'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    reportCompressedSize: true,
  },
});

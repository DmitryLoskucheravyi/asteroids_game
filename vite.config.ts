import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

// base: './' — щоб збірка працювала з будь-якого підшляху (GitHub Pages, itch.io тощо)
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
});

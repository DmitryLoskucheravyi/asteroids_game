import { defineConfig } from 'vite';

// base: './' — щоб збірка працювала з будь-якого підшляху (GitHub Pages, itch.io тощо)
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
});

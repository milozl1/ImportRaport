import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        columnMap: resolve(__dirname, 'column-map.html'),
      }
    }
  },
  server: {
    port: 3000,
    open: false
  }
});

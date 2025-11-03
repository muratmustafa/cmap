import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { resolve } from 'path';

export default defineConfig({
  plugins: [cesium()],
  server: {
    port: 5173
  },
  root: '.',  // Proje kök dizini
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
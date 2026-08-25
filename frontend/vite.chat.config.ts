import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const eeDir = existsSync(fileURLToPath(new URL('./src/_ee', import.meta.url)))
  ? './src/_ee'
  : './src/_ee-stubs';

const backendTarget = process.env.BACKEND_URL || 'http://localhost:3901';

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: [
      {
        find: /^@\/router\/index$/,
        replacement: fileURLToPath(new URL('./src/router/chat.ts', import.meta.url)),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@ee', replacement: fileURLToPath(new URL(eeDir, import.meta.url)) },
    ],
  },
  server: {
    port: 5174,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': backendTarget,
      '/socket.io': { target: backendTarget, ws: true },
    },
  },
  build: {
    outDir: 'dist-chat',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./chat.html', import.meta.url)),
    },
  },
});

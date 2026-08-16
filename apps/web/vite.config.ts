import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: true,
  },
  preview: {
    port: 4173,
  },
  optimizeDeps: {
    include: ['echarts'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});

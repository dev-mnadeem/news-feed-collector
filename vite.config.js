import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Dev/preview port. Kept in one place so the README, Dockerfile and compose agree. */
const DEV_PORT = 7141;

export default defineConfig({
  plugins: [react()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { port: DEV_PORT, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/**'] },
  },
});

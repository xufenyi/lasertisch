import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [repositoryRoot],
    },
  },
  build: {
    outDir: 'web-dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
  },
});


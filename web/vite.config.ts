import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:7880',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});

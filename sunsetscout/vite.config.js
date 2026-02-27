import { defineConfig } from 'vite';

export default defineConfig({
  base: '/SunWatcher/',
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html'
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  },
  worker: {
    format: 'es'
  }
});

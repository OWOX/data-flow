import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: 'ui',
  resolve: {
    alias: {
      '@mc/okf': fileURLToPath(new URL('./ui/okf/index.ts', import.meta.url)),
      ...(command === 'serve'
        ? { '@owox/plugin-sdk': fileURLToPath(new URL('./ui/sdk-mock.ts', import.meta.url)) }
        : {}),
    },
  },
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    rollupOptions: { external: ['@owox/plugin-sdk'] },
  },
}));

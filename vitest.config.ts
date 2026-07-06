import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    alias: {
      '@owox/plugin-sdk': new URL('./ui/sdk-mock.ts', import.meta.url).pathname,
      '@mc/okf': new URL('./ui/okf/index.ts', import.meta.url).pathname,
    },
  },
});

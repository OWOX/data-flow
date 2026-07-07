import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./ui/test/setup.ts'],
    // Cap worker forks at 4 (hardware constraint) from BOTH ends. `--maxWorkers=4`
    // alone only lowers maxForks; minForks still defaults to the core count, and on
    // an 8+-core machine minForks(8) > maxForks(4) crashes Tinypool. Pin min low.
    pool: 'forks',
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
    alias: {
      '@owox/plugin-sdk': new URL('./ui/sdk-mock.ts', import.meta.url).pathname,
    },
  },
});

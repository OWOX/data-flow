import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The OWOX host provides these as a shared import map (/vendor/*); keep them
// external so there's one shared copy in the iframe.
const SHARED_EXTERNALS = [
  'react', 'react-dom', 'react-dom/client',
  'react/jsx-runtime', 'react/jsx-dev-runtime',
  'react-router-dom', '@owox/plugin-sdk',
];
const IMPORT_MAP = {
  imports: {
    react: '/vendor/react.js',
    'react/jsx-runtime': '/vendor/react-jsx-runtime.js',
    'react/jsx-dev-runtime': '/vendor/react-jsx-runtime.js',
    'react-dom': '/vendor/react-dom.js',
    'react-dom/client': '/vendor/react-dom-client.js',
    'react-router-dom': '/vendor/react-router-dom.js',
    '@owox/plugin-sdk': '/vendor/plugin-sdk.js',
  },
};

// We ship a PREBUILT ui/ (not source), so the host serves it as-is and does NOT
// run its own esbuild. Reason: esbuild leaves the shared deps external and turns
// the CJS `require("react")` inside use-sync-external-store (pulled in by
// @xyflow/react → zustand) into a runtime `__require("react")` that throws
// "Dynamic require of 'react' is not supported" in the iframe → blank screen.
// Vite/rollup instead converts that CJS require into a proper ESM `import`, so
// the prebuilt bundle loads. Because the host only injects its import map when it
// builds a source entry, a prebuilt index.html must carry the import map itself —
// this plugin injects it below.
function injectImportMap(): Plugin {
  return {
    name: 'owox-inject-import-map',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script></head>`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), injectImportMap()],
  root: 'app',
  base: './', // relative asset paths — the host serves the plugin under a subpath
  resolve: {
    // `npm run dev`: resolve the SDK to the local mock so the UI runs with no host.
    alias:
      command === 'serve'
        ? { '@owox/plugin-sdk': fileURLToPath(new URL('./app/sdk-mock.ts', import.meta.url)) }
        : {},
  },
  build: {
    outDir: '../ui',
    emptyOutDir: true,
    rollupOptions: {
      external: SHARED_EXTERNALS,
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
        chunkFileNames: '[name].js',
      },
    },
  },
}));

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Published by GitHub Pages at https://owox.github.io/data-flow/ — delivery.url in plugin.json
// must match, and base must carry the repo path or the bundle 404s off the org root.
const BASE = '/data-flow/'

export default defineConfig({
  base: BASE,
  plugins: [react()],
})

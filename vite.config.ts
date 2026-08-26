import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// This plugin's fixed public address: KeenDNS terminates HTTPS and proxies to this Mac on PORT.
// delivery.url in plugin.json must match, and Vite must allow the Host header the tunnel sends.
const TUNNEL_HOST = 'model-canvas.dorland.keenetic.pro'
const PORT = 8787

// The plugin iframe has an opaque origin, so even its own bundle is fetched cross-origin —
// cors/host are required for both `dev` (live reload inside OWOX) and `preview` (the built page).
const server = {
  port: PORT,
  strictPort: true,
  host: true,
  cors: true,
  allowedHosts: [TUNNEL_HOST],
}

export default defineConfig({
  base: '/',
  // npm sets this when the build runs through a script, so the page can say which build it is.
  define: { __VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  plugins: [react()],
  server,
  preview: server,
})

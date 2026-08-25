import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Served at the domain root (Keenetic/KeenDNS -> this Mac), not under a repo path.
  base: '/',
  plugins: [react()],
})

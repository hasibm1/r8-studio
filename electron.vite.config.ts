import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// A strict content security policy for the built app. The dev server needs
// inline scripts for hot reload, so the policy is only added at build time.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'"

const csp = (): Plugin => ({
  name: 'r8-csp',
  transformIndexHtml: (html, ctx) => (ctx.server ? html : html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`))
})

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react(), csp()] }
})

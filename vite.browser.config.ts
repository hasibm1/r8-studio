// Runs the UI alone in a browser tab (no Electron), for working on screens.
// Projects are kept in the browser's localStorage in this mode.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})

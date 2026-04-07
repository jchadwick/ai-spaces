import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const openclawPort = process.env.OPENCLAW_PORT || (process.env.OPENCLAW_SANDBOX_HOME ? '18789' : '18789');
const openclawHost = process.env.OPENCLAW_API || `http://localhost:${openclawPort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: openclawHost,
        changeOrigin: true,
      },
    },
  },
})

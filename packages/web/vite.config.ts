import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const serverPort = process.env.AI_SPACES_PORT || '3001';
const serverHost = process.env.AI_SPACES_URL || `http://localhost:${serverPort}`;

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
        target: serverHost,
        changeOrigin: true,
      },
      '/ws': {
        target: serverHost,
        ws: true,
      },
    },
  },
})

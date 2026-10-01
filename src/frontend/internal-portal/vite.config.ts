import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3001,
    // Mirrors nginx: the API lives under /api and the prefix is stripped before reaching the service.
    proxy: {
      '/api/auth': { target: 'http://localhost:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/users': { target: 'http://localhost:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/claims': { target: 'http://localhost:8002', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: { outDir: 'dist' },
})

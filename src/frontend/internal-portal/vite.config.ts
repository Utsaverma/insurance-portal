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
    proxy: {
      '/auth': { target: 'http://localhost:8001', changeOrigin: true },
      '/users': { target: 'http://localhost:8001', changeOrigin: true },
      '/claims': { target: 'http://localhost:8002', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
})

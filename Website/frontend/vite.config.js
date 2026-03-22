import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['earcut'],
    exclude: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react', 'deck.gl'],
  },
  server: {
    proxy: {
      // During development, any fetch/axios to /api/* is forwarded to the
      // Website Backend, so we never hit CORS issues in the browser.
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})

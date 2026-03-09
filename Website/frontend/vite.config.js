import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // deck.gl ships pre-bundled ESM — let Vite import them as-is
    include: ['earcut'],
    exclude: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react', 'deck.gl'],
  },
})

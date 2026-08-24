import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/sgc-catalog': {
        target: 'https://apicatalogador.sgc.gov.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sgc-catalog/, '/api/events/search/'),
      },
    },
  },
})

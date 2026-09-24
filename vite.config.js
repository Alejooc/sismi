import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/sgc-feed': {
        target: 'https://archive.sgc.gov.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sgc-feed/, '/feed/v1.0.1/summary/five_days_all.json'),
      },
    },
  },
})

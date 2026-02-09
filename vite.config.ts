import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fsApiPlugin } from './vite-plugins/fs-api'

export default defineConfig({
  base: '/sign-annotator/',
  plugins: [react(), tailwindcss(), fsApiPlugin()],
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative assets work both at the Pages domain root and under /repository-name/.
  base: './',
})

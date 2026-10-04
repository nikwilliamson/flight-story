import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://nikwilliamson.github.io/flight-story/
export default defineConfig({
  base: '/flight-story/',
  plugins: [react()],
})

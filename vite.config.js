import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // GitHub Pages project site: https://tribien.github.io/mindmap/
  base: '/mindmap/',
})

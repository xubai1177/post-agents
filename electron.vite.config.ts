import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: { build: { rollupOptions: { input: {
    index: fileURLToPath(new URL('./src/preload/index.ts', import.meta.url)),
    canvas: fileURLToPath(new URL('./src/preload/canvas.ts', import.meta.url)),
    video: fileURLToPath(new URL('./src/preload/video.ts', import.meta.url))
  } } } },
  renderer: {
    resolve: { alias: { "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)) } },
    plugins: [react(), tailwindcss()]
  }
})

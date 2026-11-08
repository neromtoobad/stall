import { defineConfig } from 'vite'
export default defineConfig({
  server: { host: true, port: 5180, proxy: { '/api': 'http://localhost:8787', '/dev': 'http://localhost:8787' } },
  build: { target: 'es2020' },
})

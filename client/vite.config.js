import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy API + file requests to the backend so the frontend can use
// same-origin relative URLs (which also work in a combined production deploy).
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/files': { target, changeOrigin: true },
    },
  },
});

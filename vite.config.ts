import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Build with a placeholder base. The container entrypoint
  // (docker-entrypoint.d/40-chino-base.sh) rewrites `/__BASE__/` to the
  // real BASE_PATH at start, so ONE image works mounted at any URL path
  // (root `/` for neutral self-host, `/chino/` for the demo).
  base: '/__BASE__/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

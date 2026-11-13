import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// strictPort: fail loudly instead of silently moving to another port, because
// the API's CORS origin and the measurement script both assume 5173.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});

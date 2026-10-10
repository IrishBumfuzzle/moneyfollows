import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// .env lives at the repo root; only VITE_* keys reach the browser. 127.0.0.1:5174 is the local
// auth site_url in supabase/config.toml, where invite links land (the student app runs on 5173).
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { port: 5174 },
});

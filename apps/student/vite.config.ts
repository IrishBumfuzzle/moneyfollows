import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// .env lives at the repo root (.env.example), shared with the dashboard and scripts.
export default defineConfig({ plugins: [react()], envDir: '../..' });

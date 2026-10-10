import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// .env lives at the repo root (shared with the dashboard and scripts); only VITE_* keys reach the browser.
export default defineConfig({ plugins: [react()], envDir: '../..' });

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { bimodalWsHubPlugin } from './server/wsHubPlugin.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), bimodalWsHubPlugin()],
  server: {
    host: '0.0.0.0',
    port: 4321,
  },
});

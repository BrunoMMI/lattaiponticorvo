import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const site = process.env.SITE_URL ?? 'https://lattaiponticorvo.com';
const { hostname, protocol } = new URL(site);

export default defineConfig({
  site,
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  security: {
    checkOrigin: true,
    // Host attendibili per ricostruire l'URL della richiesta (necessario per il controllo CSRF dietro proxy).
    allowedDomains: [
      { hostname, protocol: protocol.replace(':', '') },
      { hostname: `www.${hostname}`, protocol: protocol.replace(':', '') },
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
    ],
  },
});

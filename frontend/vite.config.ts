import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const spaBypassForBrowserNavigation = (req: any) => {
  const secFetchMode = String(req.headers?.['sec-fetch-mode'] || '').toLowerCase();
  const secFetchDest = String(req.headers?.['sec-fetch-dest'] || '').toLowerCase();
  const accept = String(req.headers?.accept || '').toLowerCase();
  const hasApiSig = Boolean(
    req.headers?.['x-synaptix-signature'] || req.headers?.['x-synaptix-device-id']
  );

  if (
    req.method === 'GET' &&
    (secFetchMode === 'navigate' ||
      secFetchDest === 'document' ||
      (accept.includes('text/html') && !hasApiSig))
  ) {
    return '/index.html';
  }
  return undefined;
};

const proxyConfig = {
  '/auth': 'http://127.0.0.1:8000',
  '/chat': 'http://127.0.0.1:8000',
  '/notifications': 'http://127.0.0.1:8000',
  '/tasks': {
    target: 'http://127.0.0.1:8000',
    bypass: spaBypassForBrowserNavigation,
  },
  '/upload': 'http://127.0.0.1:8000',
  '/uploads': 'http://127.0.0.1:8000',
  '/workspaces': 'http://127.0.0.1:8000',
  '/notebooks': 'http://127.0.0.1:8000',
  '/notes': {
    target: 'http://127.0.0.1:8000',
    bypass: spaBypassForBrowserNavigation,
  },
  '/comments': 'http://127.0.0.1:8000',
  '/comment-connections': 'http://127.0.0.1:8000',
  '/analyze': 'http://127.0.0.1:8000',
  '/events': 'http://127.0.0.1:8000',
  '/calendar': {
    target: 'http://127.0.0.1:8000',
    bypass: spaBypassForBrowserNavigation,
  },
  '/team-admin': 'http://127.0.0.1:8000',
  '/team-portal': 'http://127.0.0.1:8000',
  '/team-auth': 'http://127.0.0.1:8000',
  '/guided-study': 'http://127.0.0.1:8000',
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 6080,
    strictPort: true,
    allowedHosts: true,
    proxy: proxyConfig,
  },
  preview: {
    host: '0.0.0.0',
    port: 6080,
    strictPort: true,
    allowedHosts: true,
    proxy: proxyConfig,
  },
})

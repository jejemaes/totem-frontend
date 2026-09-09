import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'
// `defineConfig` from vitest/config, not vite: it is the one that types the
// `test` block below. `loadEnv` is not re-exported there, hence two imports.
import { defineConfig } from 'vitest/config'

// The dev server runs inside a container (node is not installed on the host),
// so every network-facing option below has to be explicit.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Container name on totem-saas-network, which both this dev container and
  // totem-backend join. Resolved by Docker DNS, so it needs no published port.
  const backend = env.VITE_DEV_PROXY_TARGET || 'http://totem-backend:8000'

  // Django does NOT serve public media: its only /media/ route is a catch-all
  // to ServeSignedUrlsStorageNginxView, which refuses any URL without a
  // `signature` query param -- and answers with Django's HTML 403 page, since
  // that route is not under NinjaAPI. So an <img src="/media/public/...">
  // proxied to the backend directly just breaks, with nothing useful in the
  // console. totem-backend-nginx is what serves that path from the media
  // volume, and it shares totem-saas-network with this container.
  const media = env.VITE_DEV_MEDIA_PROXY_TARGET || 'http://totem-backend-nginx:80'

  return {
    // Public base path. Baked in at BUILD time (Vite rewrites every asset URL),
    // which is why it is a build arg in docker/Dockerfile and not a runtime
    // variable. totem-proxy currently serves the tenant frontend under
    // /tabou/ and forwards that prefix untouched, so the bundle must own it.
    base: env.VITE_BASE_PATH || '/tabou/',

    plugins: [vue()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      // Equivalent to --host 0.0.0.0. Vite binds 127.0.0.1 by default, which is
      // unreachable from outside the container's network namespace.
      host: true,
      port: Number(env.VITE_PORT ?? 5173),
      // Fail loudly instead of silently drifting to 5174, which compose does
      // not publish and which would look like "the server is down".
      strictPort: true,
      // Vite >= 6 rejects requests whose Host header it does not recognise.
      // Without this, browsing via acme.localhost:5173 returns
      // "Blocked request. This host is not allowed."
      allowedHosts: ['localhost', '.localhost'],
      watch: {
        // Not needed on Linux with a native bind mount: inotify events cross
        // it fine. Set VITE_USE_POLLING=1 on Docker Desktop (macOS/Windows) or
        // WSL2 with the repo on /mnt/c -- it costs real CPU, so keep it opt-in.
        usePolling: env.VITE_USE_POLLING === '1',
        interval: 300,
      },
      // In production totem-proxy serves this app under /tabou/ on the tenant
      // domain and routes every other path to the tenant backend, so the app
      // calls /api and /o with relative URLs and there is no CORS. The dev
      // server has to reproduce that same-origin arrangement itself.
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/o': { target: backend, changeOrigin: true },
        // The Django-rendered pages (/admin, the OAuth authorize view) pull
        // their assets from /static.
        '/admin': { target: backend, changeOrigin: true },
        '/static': { target: backend, changeOrigin: true },
        // Not `backend`: see the comment on `media` above. This is also what
        // the rich text editor's uploaded images are served from.
        '/media': { target: media, changeOrigin: true },
      },
    },

    test: {
      // Nothing under test touches the DOM: the pure helpers and the state
      // machine are deliberately free of it. `useTheme` would need jsdom.
      environment: 'node',
      include: ['src/**/*.spec.ts'],
    },
  }
})

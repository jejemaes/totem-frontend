import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// The dev server runs inside a container (node is not installed on the host),
// so every network-facing option below has to be explicit.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Public base path. Baked in at BUILD time (Vite rewrites every asset URL),
    // which is why it is a build arg in docker/Dockerfile and not a runtime
    // variable. totem-proxy currently serves the tenant frontend under
    // /tabou/ and forwards that prefix untouched, so the bundle must own it.
    base: env.VITE_BASE_PATH || '/',

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
      // NOTE: no /api or /o proxy yet -- this step has no backend integration.
      // See docs/commands.md when wiring totem-backend in.
    },
  }
})

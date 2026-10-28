/// <reference types="vite/client" />

/**
 * Variables inlined into the bundle at BUILD time by Vite.
 *
 * WARNING: one image serves every tenant, so nothing tenant-specific (slug,
 * branding, feature flags) can live here -- it would be frozen at build time
 * for all domains. See default.env.
 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

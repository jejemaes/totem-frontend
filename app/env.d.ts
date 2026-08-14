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
  /**
   * Public OAuth client id, registered in the backend's OAuthApp table.
   * Public by construction: it ships inside the bundle.
   */
  readonly VITE_OAUTH_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

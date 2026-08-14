/**
 * Permission helpers.
 *
 * Permissions ARE the OAuth scopes: the backend derives the token's `scope`
 * from the union of the user's roles' permissions (see totem-backend
 * src/oauth/scopes.py). Tokens are opaque, so the scope string from the token
 * response is the only source -- there is nothing to decode client-side.
 *
 * This gating is a UX affordance, not a security boundary. The backend checks
 * the same scopes on every request; hiding a button the user cannot use just
 * saves them a 403.
 */

import { useAuthStore } from './authStore'

export function can(permission: string): boolean {
  return useAuthStore().scopes.has(permission)
}

export function canAny(permissions: string[]): boolean {
  const { scopes } = useAuthStore()
  return permissions.some((permission) => scopes.has(permission))
}

export function canAll(permissions: string[]): boolean {
  const { scopes } = useAuthStore()
  return permissions.every((permission) => scopes.has(permission))
}

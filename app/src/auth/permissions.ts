/**
 * Permission helpers.
 *
 * Permissions ARE the token's scopes: the backend derives `scope` from the
 * union of the user's roles' permissions (see totem-backend
 * src/user/access_rights.py), again on every rotation. The access token is a
 * JWT that carries them too, but the `scope` of the token response is the
 * source used here -- decoding the JWT would mean trusting a format the client
 * does not need to know.
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

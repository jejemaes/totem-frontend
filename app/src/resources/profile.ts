/*
 * /api/v1/users/me/ -- the signed-in account, read and edited by its owner.
 *
 * Not folded into `users.ts`, although it is the same model: the scopes differ.
 * `/users/{id}/` needs `totem.user.*`, `/users/me/` only a session, so every
 * account can reach its own profile -- and the shapes differ too (no `roles`,
 * no `is_active`, no `user_type`: nothing a user may grant themself).
 *
 * A SINGLETON addressed by alias, like `/website/websites/current/`: there is
 * no list, no create and no delete.
 */

import { apiFetch, patchJson } from '@/api/client'

import type { UserLanguage } from './users'

/** UserProfileSchema, minus `avatar`, which no screen edits yet. */
export interface UserProfile {
  id: string
  /** The ORM field is `username`; the API exposes and expects `login`. */
  login: string
  email: string | null
  first_name: string | null
  last_name: string | null
  language: string | null
}

/**
 * Body of PATCH /users/me/. Every key optional, and that is the point: the
 * backend updates with `exclude_unset=True`, so an omitted key is LEFT ALONE
 * where an explicit `null` is written.
 */
export interface ProfileUpdatePayload {
  /** Unique; it is what the user signs in with. */
  login?: string
  email?: string
  first_name?: string | null
  last_name?: string | null
  /** NOT nullable, merely defaulted: an explicit `null` is a 422. */
  language?: UserLanguage
}

export function fetchProfile(signal?: AbortSignal): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me/', { signal })
}

/** Answers the updated profile, the same shape a read returns. */
export function updateProfile(payload: ProfileUpdatePayload): Promise<UserProfile> {
  return patchJson<UserProfile>('/users/me/', payload)
}

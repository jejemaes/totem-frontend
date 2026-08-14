import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, fetchProfile, type UserProfile } from '@/api/client'

import { requestToken, revokeToken } from './oauth'
import { clearTokens, getTokens, setTokens } from './tokenStorage'

export const useAuthStore = defineStore('auth', () => {
  // Seeded from storage so a page reload does not log the user out.
  const tokens = ref(getTokens())
  const profile = ref<UserProfile | null>(null)
  /** Guards against re-checking a token we have already validated this session. */
  const sessionChecked = ref(false)

  const isAuthenticated = computed(() => tokens.value !== null)

  /**
   * Scopes granted by the token, i.e. the user's permissions. Not used to gate
   * anything yet -- the admin screens will read it.
   */
  const scopes = computed(() => new Set((tokens.value?.scope ?? '').split(' ').filter(Boolean)))

  async function login(username: string, password: string): Promise<void> {
    const received = await requestToken(username, password)
    setTokens(received)
    tokens.value = received
    profile.value = await fetchProfile()
    sessionChecked.value = true
  }

  /** Clears the local session. `notifyServer` is false when the token is already dead. */
  async function logout(notifyServer = true): Promise<void> {
    const token = tokens.value?.accessToken
    clearTokens()
    tokens.value = null
    profile.value = null
    sessionChecked.value = false
    if (notifyServer && token) await revokeToken(token)
  }

  /**
   * Confirms the stored token is still accepted by the backend, by fetching the
   * profile once per session.
   *
   * Holding a token is not the same as having a session: it can be expired, or
   * revoked server-side when a user's rights change. Without this the router
   * would happily open a protected page that then fails every request.
   */
  async function ensureSession(): Promise<boolean> {
    if (!tokens.value) return false
    if (sessionChecked.value) return true

    try {
      profile.value = await fetchProfile()
      sessionChecked.value = true
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout(false)
        return false
      }
      // A network or 5xx error is not proof the session is invalid: keep it and
      // let the page surface the failure rather than logging the user out.
      throw error
    }
  }

  return { tokens, profile, isAuthenticated, scopes, login, logout, ensureSession }
})

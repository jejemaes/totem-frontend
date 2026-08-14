import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'

import DiagnosticView from '@/views/DiagnosticView.vue'
import LoginView from '@/views/LoginView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import ProtectedView from '@/views/ProtectedView.vue'
import PublicView from '@/views/PublicView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * 'required'   the user must have a valid session (default)
     * 'none'       open to anyone
     * 'guest-only' only when signed out, e.g. the login page
     *
     * Adding a magic-link / one-time-token mode later means one more value and
     * one more case in the guard below -- nothing else moves.
     */
    auth?: 'required' | 'none' | 'guest-only'
    title?: string
  }
}

// import.meta.env.BASE_URL is Vite's `base`, so the router and the asset URLs
// can never disagree about the prefix the app is mounted under.
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'public', component: PublicView, meta: { auth: 'none' } },
    { path: '/diagnostic', name: 'diagnostic', component: DiagnosticView, meta: { auth: 'none' } },
    { path: '/login', name: 'login', component: LoginView, meta: { auth: 'guest-only' } },
    { path: '/espace', name: 'protected', component: ProtectedView, meta: { auth: 'required' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { auth: 'none' } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const mode = to.meta.auth ?? 'required'

  if (mode === 'none') return true

  // ensureSession only answers false when the backend actively rejected the
  // token. If it throws, the backend is unreachable -- that is not proof the
  // session died, so fall back to "do we hold a token at all" and let the
  // destination page report the failure. Logging someone out on a transient
  // network blip would be worse than showing them a page that errors.
  let signedIn: boolean
  try {
    signedIn = await auth.ensureSession()
  } catch {
    signedIn = auth.isAuthenticated
  }

  // Already signed in: no reason to show the login form again.
  if (mode === 'guest-only') return signedIn ? { name: 'protected' } : true

  if (signedIn) return true
  // Keep where the user was heading so login can send them back there.
  return { name: 'login', query: { redirect: to.fullPath } }
})

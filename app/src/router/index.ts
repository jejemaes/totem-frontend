import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'
import AdminLayout from '@/layouts/AdminLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'

import DashboardView from '@/views/DashboardView.vue'
import DiagnosticView from '@/views/DiagnosticView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import FormDemoView from '@/views/FormDemoView.vue'
import LoginView from '@/views/LoginView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import PublicView from '@/views/PublicView.vue'
import UserFormView from '@/views/settings/UserFormView.vue'
import UsersView from '@/views/settings/UsersView.vue'

import { HOME_ROUTE } from './constants'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * 'required'   the user must have a valid session (default)
     * 'none'       open to anyone
     * 'guest-only' only when signed out, e.g. the login page
     *
     * Adding a magic-link / one-time-token mode later means one more value and
     * one more branch in the guard -- nothing else moves.
     */
    auth?: 'required' | 'none' | 'guest-only'
    /** OAuth scopes required on top of a valid session. All of them must be held. */
    permissions?: string[]
    title?: string
  }
}

// import.meta.env.BASE_URL is Vite's `base`, so the router and the asset URLs
// can never disagree about the prefix the app is mounted under.
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Signed-in area: sidebar + topbar.
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: 'dashboard', name: 'dashboard', component: DashboardView, meta: { title: 'Dashboard' } },
        {
          path: 'settings/users',
          name: 'settings-users',
          component: UsersView,
          meta: { title: 'Users', permissions: ['totem.user.read'] },
        },
        // One component, two routes: UserFormView is a create form with no id
        // and an edit form with one. They stay separate routes because their
        // scopes differ -- editing has to GET the record before it can PATCH
        // it, creating reads nothing.
        //
        // Both are siblings of the list rather than children: a child route
        // would keep UsersView mounted, and it drives useResourceList with
        // syncUrl, whose watcher rewrites route.query -- it would fight the
        // form over the query string while holding a list request open behind
        // it.
        {
          path: 'settings/users/new',
          name: 'settings-user-create',
          component: UserFormView,
          meta: { title: 'New user', permissions: ['totem.user.create'] },
        },
        // Declared after 'new' for readability only: vue-router ranks a static
        // segment above a param whatever the order, so ':id' cannot swallow
        // '/new'.
        {
          path: 'settings/users/:id',
          name: 'settings-user-edit',
          component: UserFormView,
          meta: { title: 'Edit user', permissions: ['totem.user.read', 'totem.user.update'] },
        },
      ],
    },

    // Everything without the admin chrome.
    {
      path: '/',
      component: BlankLayout,
      children: [
        { path: '', name: 'public', component: PublicView, meta: { auth: 'none' } },
        { path: 'diagnostic', name: 'diagnostic', component: DiagnosticView, meta: { auth: 'none' } },
        // Development page: it exists to look at the Form/Field components
        // with no backend and no session. Deliberately absent from the menu.
        {
          path: 'form-demo',
          name: 'form-demo',
          component: FormDemoView,
          meta: { auth: 'none', title: 'Form demo' },
        },
        { path: 'login', name: 'login', component: LoginView, meta: { auth: 'guest-only' } },
        { path: '403', name: 'forbidden', component: ForbiddenView, meta: { auth: 'none' } },
        { path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { auth: 'none' } },
      ],
    },
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
  if (mode === 'guest-only') return signedIn ? HOME_ROUTE : true

  if (!signedIn) {
    // Keep where the user was heading so login can send them back there.
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Authenticated but not authorised: 403, not a redirect to login. Sending
  // them to a login form they have already passed would be a dead end.
  const required = to.meta.permissions ?? []
  if (required.some((permission) => !auth.scopes.has(permission))) {
    return { name: 'forbidden', query: { from: to.fullPath } }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Totem Admin` : 'Totem Admin'
})

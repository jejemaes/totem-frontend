import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'
import AdminLayout from '@/layouts/AdminLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'

import AccountCategoriesPage from '@/pages/accounting/AccountCategoriesPage.vue'
import AccountCategoryPage from '@/pages/accounting/AccountCategoryPage.vue'
import AccountMovementPage from '@/pages/accounting/AccountMovementPage.vue'
import AccountMovementsPage from '@/pages/accounting/AccountMovementsPage.vue'
import AccountPage from '@/pages/accounting/AccountPage.vue'
import AccountsPage from '@/pages/accounting/AccountsPage.vue'
import BudgetChartPage from '@/pages/accounting/BudgetChartPage.vue'
import BudgetPage from '@/pages/accounting/BudgetPage.vue'
import BudgetsPage from '@/pages/accounting/BudgetsPage.vue'
import ContactPage from '@/pages/contacts/ContactPage.vue'
import ContactsPage from '@/pages/contacts/ContactsPage.vue'
import ContactTagPage from '@/pages/contacts/ContactTagPage.vue'
import ContactTagsPage from '@/pages/contacts/ContactTagsPage.vue'
import DashboardPage from '@/pages/DashboardPage.vue'
import DiagnosticPage from '@/pages/DiagnosticPage.vue'
import ForbiddenPage from '@/pages/ForbiddenPage.vue'
import FormDemoPage from '@/pages/FormDemoPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'
import PublicPage from '@/pages/PublicPage.vue'
import ProfilePage from '@/pages/settings/ProfilePage.vue'
import UserPage from '@/pages/settings/UserPage.vue'
import UsersPage from '@/pages/settings/UsersPage.vue'
import WebsiteConfigurationPage from '@/pages/website/WebsiteConfigurationPage.vue'
import WebsiteMenuPage from '@/pages/website/WebsiteMenuPage.vue'
import WebsiteMenusPage from '@/pages/website/WebsiteMenusPage.vue'
import WebsitePagePage from '@/pages/website/WebsitePagePage.vue'
import WebsitePagesPage from '@/pages/website/WebsitePagesPage.vue'

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
    /** Scopes required on top of a valid session. All of them must be held. */
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
        { path: 'dashboard', name: 'dashboard', component: DashboardPage, meta: { title: 'Dashboard' } },

        // Contacts. Same three-route shape as the users block below, and the
        // paths mirror the API's own (/contacts/, /contact-tags/). Tags get a
        // top-level path rather than '/contacts/tags' so no one ever has to
        // reason about whether ':id' could swallow it.
        {
          path: 'contacts',
          name: 'contacts',
          component: ContactsPage,
          meta: { title: 'Contacts', permissions: ['totem.contact.read'] },
        },
        {
          path: 'contacts/new',
          name: 'contact-create',
          component: ContactPage,
          meta: { title: 'New contact', permissions: ['totem.contact.create'] },
        },
        {
          path: 'contacts/:id',
          name: 'contact-edit',
          component: ContactPage,
          meta: {
            title: 'Edit contact',
            permissions: ['totem.contact.read', 'totem.contact.update'],
          },
        },
        {
          path: 'contact-tags',
          name: 'contact-tags',
          component: ContactTagsPage,
          meta: { title: 'Contact tags', permissions: ['totem.contacttag.read'] },
        },
        {
          path: 'contact-tags/new',
          name: 'contact-tag-create',
          component: ContactTagPage,
          meta: { title: 'New tag', permissions: ['totem.contacttag.create'] },
        },
        {
          path: 'contact-tags/:id',
          name: 'contact-tag-edit',
          component: ContactTagPage,
          meta: {
            title: 'Edit tag',
            permissions: ['totem.contacttag.read', 'totem.contacttag.update'],
          },
        },
        // Accounting. Paths mirror the API's own two-segment prefix
        // (/accounting/accounts/, /accounting/categories/), with the usual
        // list / new / :id shape for each.
        {
          path: 'accounting/accounts',
          name: 'accounting-accounts',
          component: AccountsPage,
          meta: { title: 'Accounts', permissions: ['totem.account.read'] },
        },
        {
          path: 'accounting/accounts/new',
          name: 'accounting-account-create',
          component: AccountPage,
          meta: { title: 'New account', permissions: ['totem.account.create'] },
        },
        {
          path: 'accounting/accounts/:id',
          name: 'accounting-account-edit',
          component: AccountPage,
          meta: {
            title: 'Edit account',
            permissions: ['totem.account.read', 'totem.account.update'],
          },
        },
        // Movements are only ever reached THROUGH an account: a movement
        // belongs to its account for good, so the account is part of the path
        // rather than a filter the user could clear. Still siblings, not
        // children of the account routes, for the same reason as every other
        // form: a mounted parent list would fight the form over the query
        // string. More segments than 'accounts/:id', so neither can swallow
        // the other.
        //
        // `totem.account.read` on all three: the list page reads the account
        // for its heading.
        {
          path: 'accounting/accounts/:accountId/movements',
          name: 'accounting-account-movements',
          component: AccountMovementsPage,
          meta: {
            title: 'Movements',
            permissions: ['totem.account.read', 'totem.accountmovement.read'],
          },
        },
        {
          path: 'accounting/accounts/:accountId/movements/new',
          name: 'accounting-account-movement-create',
          component: AccountMovementPage,
          meta: {
            title: 'New movement',
            permissions: ['totem.account.read', 'totem.accountmovement.create'],
          },
        },
        {
          path: 'accounting/accounts/:accountId/movements/:id',
          name: 'accounting-account-movement-edit',
          component: AccountMovementPage,
          meta: {
            title: 'Edit movement',
            permissions: [
              'totem.account.read',
              'totem.accountmovement.read',
              'totem.accountmovement.update',
            ],
          },
        },
        {
          path: 'accounting/categories',
          name: 'accounting-categories',
          component: AccountCategoriesPage,
          meta: { title: 'Accounting categories', permissions: ['totem.accountcategory.read'] },
        },
        {
          path: 'accounting/categories/new',
          name: 'accounting-category-create',
          component: AccountCategoryPage,
          meta: { title: 'New category', permissions: ['totem.accountcategory.create'] },
        },
        {
          path: 'accounting/categories/:id',
          name: 'accounting-category-edit',
          component: AccountCategoryPage,
          meta: {
            title: 'Edit category',
            permissions: ['totem.accountcategory.read', 'totem.accountcategory.update'],
          },
        },
        // Budgets: plural here, although the API spells its collection
        // `/accounting/budget/` -- the SPA's paths follow its own convention,
        // and only resources/budgets.ts needs to know the API's.
        {
          path: 'accounting/budgets',
          name: 'accounting-budgets',
          component: BudgetsPage,
          meta: { title: 'Budgets', permissions: ['totem.budget.read'] },
        },
        {
          path: 'accounting/budgets/new',
          name: 'accounting-budget-create',
          component: BudgetPage,
          meta: { title: 'New budget', permissions: ['totem.budget.create'] },
        },
        {
          path: 'accounting/budgets/:id',
          name: 'accounting-budget-edit',
          component: BudgetPage,
          meta: {
            title: 'Edit budget',
            permissions: ['totem.budget.read', 'totem.budget.update'],
          },
        },
        // A sibling of the edit route, not a child: nested, it would keep the
        // budget form mounted around the chart.
        {
          path: 'accounting/budgets/:id/chart',
          name: 'accounting-budget-chart',
          component: BudgetChartPage,
          meta: { title: 'Budget chart', permissions: ['totem.budget.read'] },
        },
        // The site's own settings: ONE route, not the list / new / :id shape
        // of the resources below. The row is a singleton addressed as
        // `/website/websites/current/`, so there is nothing to list and nothing
        // to create -- and the path is named after the screen rather than
        // mirroring that endpoint, which would read as `/website/websites`.
        //
        // `totem.website.read` alone: the screen degrades to a read-only form
        // without `totem.website.update`, which is what lets the menu entry
        // carry the same single permission and stay honest.
        {
          path: 'website/configuration',
          name: 'website-configuration',
          component: WebsiteConfigurationPage,
          meta: { title: 'Website configuration', permissions: ['totem.website.read'] },
        },
        // The website menu tree and the pages it points at. Paths mirror the
        // API's own two-segment prefix (/website/menus/, /website/pages/), and
        // each resource follows the same list / new / :id shape as the others.
        {
          path: 'website/menus',
          name: 'website-menus',
          component: WebsiteMenusPage,
          meta: { title: 'Website menus', permissions: ['totem.websitemenu.read'] },
        },
        {
          path: 'website/menus/new',
          name: 'website-menu-create',
          component: WebsiteMenuPage,
          meta: { title: 'New menu item', permissions: ['totem.websitemenu.create'] },
        },
        {
          path: 'website/menus/:id',
          name: 'website-menu-edit',
          component: WebsiteMenuPage,
          meta: {
            title: 'Edit menu item',
            permissions: ['totem.websitemenu.read', 'totem.websitemenu.update'],
          },
        },
        {
          path: 'website/pages',
          name: 'website-pages',
          component: WebsitePagesPage,
          meta: { title: 'Website pages', permissions: ['totem.websitepage.read'] },
        },
        {
          path: 'website/pages/new',
          name: 'website-page-create',
          component: WebsitePagePage,
          meta: { title: 'New page', permissions: ['totem.websitepage.create'] },
        },
        {
          path: 'website/pages/:id',
          name: 'website-page-edit',
          component: WebsitePagePage,
          meta: {
            title: 'Edit page',
            permissions: ['totem.websitepage.read', 'totem.websitepage.update'],
          },
        },
        // No `permissions`: `/users/me/` asks for a session and nothing more,
        // so every account reaches its own profile. Not `settings/users/me`,
        // which would sit beside `settings/users/:id` and read as one of the
        // `totem.user.*` screens.
        {
          path: 'profile',
          name: 'profile',
          component: ProfilePage,
          meta: { title: 'My profile' },
        },
        {
          path: 'settings/users',
          name: 'settings-users',
          component: UsersPage,
          meta: { title: 'Users', permissions: ['totem.user.read'] },
        },
        // One component, two routes: UserPage is a create form with no id
        // and an edit form with one. They stay separate routes because their
        // scopes differ -- editing has to GET the record before it can PATCH
        // it, creating reads nothing.
        //
        // Both are siblings of the list rather than children: a child route
        // would keep UsersPage mounted, and it drives useResourceList with
        // syncUrl, whose watcher rewrites route.query -- it would fight the
        // form over the query string while holding a list request open behind
        // it.
        {
          path: 'settings/users/new',
          name: 'settings-user-create',
          component: UserPage,
          meta: { title: 'New user', permissions: ['totem.user.create'] },
        },
        // Declared after 'new' for readability only: vue-router ranks a static
        // segment above a param whatever the order, so ':id' cannot swallow
        // '/new'.
        {
          path: 'settings/users/:id',
          name: 'settings-user-edit',
          component: UserPage,
          meta: { title: 'Edit user', permissions: ['totem.user.read', 'totem.user.update'] },
        },
      ],
    },

    // Everything without the admin chrome.
    {
      path: '/',
      component: BlankLayout,
      children: [
        { path: '', name: 'public', component: PublicPage, meta: { auth: 'none' } },
        { path: 'diagnostic', name: 'diagnostic', component: DiagnosticPage, meta: { auth: 'none' } },
        // Development page: it exists to look at the Form/Field components
        // with no backend and no session. Deliberately absent from the menu.
        {
          path: 'form-demo',
          name: 'form-demo',
          component: FormDemoPage,
          meta: { auth: 'none', title: 'Form demo' },
        },
        { path: 'login', name: 'login', component: LoginPage, meta: { auth: 'guest-only' } },
        { path: '403', name: 'forbidden', component: ForbiddenPage, meta: { auth: 'none' } },
        { path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundPage, meta: { auth: 'none' } },
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

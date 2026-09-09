# CLAUDE.md

Guidance for Claude Code working in this repository.

Written in English on purpose. `README.md` and `docs/` are the human-facing documentation and are
in French; this file is about the code, and code comments here are English throughout — see
*House rules*.

## What this is

The administration SPA of the Totem SaaS: Vue 3 + TypeScript, bundled by Vite, served by nginx,
routed per tenant domain by `totem-proxy`. It talks to `totem-backend` (Django + django-ninja)
over a same-origin REST API — no CORS, no axios, relative URLs only.

Sibling repositories, checked out next to this one:

| Path               | Role                                                          |
| ------------------ | ------------------------------------------------------------- |
| `../totem-backend` | Django API (`/api/v1`), OAuth2 provider (`/o`), media nginx   |
| `../totem-proxy`   | OpenResty; resolves the tenant from `Host`, splits front/back |

## Repository layout

```
Makefile              # THE command interface: everything runs in Docker
docker-compose.yml    # services: vite (dev), nginx (profile "preview")
default.env           # committed dev defaults; .env is gitignored
docker/               # multi-stage Dockerfile + nginx spa.conf.template
docs/commands.md      # command table and troubleshooting (French)
README.md             # deployment, proxy, auth, pagination (French)
app/                  # the Vue project -- package.json lives HERE, not at the root
  vite.config.ts  tsconfig.json  env.d.ts  index.html
  src/
    main.ts  App.vue  styles/main.css
    api/          client.ts (fetch wrapper), list.ts (pagination contract)
    auth/         oauth.ts, tokenStorage.ts, authStore.ts (Pinia), permissions.ts
    components/   ColorDot.vue, ColorTag.vue, colors.ts
      form/       Form.vue, context.ts, FieldSwitch, fields/, widget/
      list/       MultiRecordFilters.vue, filters.ts
    composables/  useResourceList.ts, useResourceForm.ts, useFilter.ts, useTheme.ts
    layouts/      AdminLayout.vue, BlankLayout.vue, AppMenu.vue, menu.ts
    plugins/      primevue.ts
    resources/    one module per backend endpoint
    router/       index.ts (all routes + the single guard), constants.ts
    views/        one folder per feature: contacts/, settings/, website/
```

`app/` holds the application, the root holds the infrastructure — the same split as
`totem-backend`'s `src/`.

Stack: `vue` 3.5, `vue-router` 4.5, `pinia` 2.3, `primevue` 4.5 (Aura preset) + `primeicons`,
`@tiptap/*` 3.31 for the rich-text widget, `vitest` 4, `vue-tsc`, `typescript` 5.7, `vite` 6.
Every version is pinned exactly, with no `^` — keep it that way.

## Commands

**`node` and `npm` are not installed on the host.** Every command runs in a container, and the
root `Makefile` is the only interface. `make` alone prints the list.

```bash
make install             # build the dev image, then npm ci
make dev                 # Vite dev server with HMR on http://localhost:5173
make typecheck           # vue-tsc --noEmit
make test                # vitest run   (make test WATCH=1 to watch)
make build               # production bundle into app/dist/
make preview             # nginx serving the bundle on http://localhost:3006/tabou/
make add PKG=primevue    # add a dependency  (PKG="-D vitest" for a dev one)
make sh                  # a shell in the dev container
make clean               # containers + node_modules volume + app/dist
```

Never suggest a bare `npm …` on the host: it will fail. CI (`.github/workflows/tests.yml`) does
run the toolchain natively, and that is the only place it does — "no node on the host" is a fact
about the dev machine, not about GitHub runners.

**Before calling any change done: `make typecheck && make test`.** Both are CI gates, along with
`make build` (`npm run build` is itself `vue-tsc --noEmit && vite build`).

**There is no linter and no formatter** — no ESLint, no Prettier. `.editorconfig` (LF, utf-8,
2-space indent, final newline, no trailing whitespace) is the only mechanical authority; the rest
is upheld by hand. Match the surrounding code.

Add dependencies with `make add`, never by editing `package.json` by hand: the lockfile and the
`node_modules` volume have to stay in step. Justify each new dependency before adding it; the
toolchain is kept deliberately small.

## House rules

1. **English in all code.** Comments, identifiers, UI labels, placeholders, help text, error
   messages, `meta.title`, and commit messages. Several older screens still hold French strings —
   `views/settings/UsersView.vue` is French while `UserFormView.vue` next to it is English — so
   do **not** match a neighbouring French file. Retranslating them is a separate, explicitly
   requested job. `README.md` and `docs/` stay in French.

2. **Never mutate the `totem-backend` database.** When work here needs backend data (roles,
   permissions, fixtures), give a copy-pasteable command and let the owner run it. Bootstrapping
   an *empty* database with `manage.py populate` is fine; changing existing rows is not.
   Implement and verify everything that does not depend on that data, then state plainly what
   could not be verified.

3. **Do not widen the generic form framework's shared contract as a side effect.**
   `app/src/components/form/` is used by every screen. Adding a *new widget* whose value is still a
   `FieldValue` is a welcome additive extension — that is how `date`, `color`, `datetime` and
   `html` arrived. Changing `FieldValue` itself, or the way `Form.vue` compares values, has every
   form as its blast radius: it has happened exactly once, when `many2many_tags` needed a list, and
   it forced `sameFieldValue` to grow set comparison. That is a decision to raise explicitly, never
   something to slip into a feature. When a field's value is not expressible as a `FieldValue`,
   propose a **detached** widget under `form/widget/` first (see `UserRolesSelectionWidget.vue`) and
   name what the view must then re-implement itself: value ownership, dirty tracking, re-seeding on
   record change, server-error routing, readonly propagation. A narrow documented hook on
   `useResourceForm` (`onLoaded`, `hasExternalChanges`) is the accepted middle ground.

4. **A new capability inside a widget defaults to off.** It becomes an entry in `FieldOptions`,
   opted into by the one `<Field>` that needs it — `options.allowWidget` on `HtmlField` is the
   model, and it mirrors the backend flag's own name and default
   (`HtmlFieldMixin(allow_widget=False)`), which is what makes the correspondence checkable.

5. **Comment the *why*, not the *what*.** Every module opens with a header comment stating why it
   exists and what would break otherwise; inline comments name the rejected alternative and its
   failure mode. This is the strongest convention in the repo — keep writing them.
   `api/client.ts`, `components/form/context.ts`, `composables/useResourceForm.ts` and
   `resources/users.ts` are the models.

## Architecture

### Boot order

`app/src/main.ts`, and the order is load-bearing:

```ts
initTheme()                 // before mount, so there is no flash of the wrong theme
const app = createApp(App)
installPrimeVue(app)
app.use(createPinia())      // must precede the router: the guard calls useAuthStore()
app.use(router)
app.mount('#app')
```

### The layering rule

```
api/  ──▶  resources/  ──▶  views/  ◀──  composables/
(wire)     (per model)      (screen)     (display state)
```

- `api/` is the wire contract: pure TypeScript, no Vue, no knowledge of any model.
- `resources/` owns one endpoint each: its path, its `?fields=` list, its row/detail types, its
  accepted filters, its CRUD functions.
- `composables/` own display state (paging, sorting, debouncing, dirtiness, errors).
- `views/` wire the three together, declare the fields and columns, and build payloads.

**The load-bearing invariant: a composable never imports a `resources/` module.** It receives
`fetchPage`, or `fetchOne` / `create` / `update`, as callbacks. That is what makes
`useResourceList` and `useResourceForm` resource-agnostic and testable with fake functions — no
`fetch` mocking, no component mounting. Do not break it for convenience.

Related: every piece of state in those two composables lives *inside* the function. Never hoist a
`ref` to module scope there. `useTheme` is app-wide state and is the one deliberate exception.

### The race-ticket idiom

Repeated verbatim in `useResourceList`, `useResourceForm.load` and `UserRolesSelectionWidget`, and
worth copying rather than reinventing: a monotonic `let seq = 0` ticket gates every state write, an
`AbortController` aborts the superseded request, and `onScopeDispose(() => inFlight?.abort())`
cleans up. Without it, an older response landing last contradicts the sort arrow the user sees.

### Registries — everything is declared as data

No decorators, no auto-discovery, no `import.meta.glob`:

| What           | Where                                                       |
| -------------- | ----------------------------------------------------------- |
| Widgets        | `WIDGETS` in `form/fields/Field.vue` + the `Widget` union in `form/fields/types.ts` |
| Routes         | the `routes` array in `router/index.ts`                     |
| Sidebar menu   | the `menu` array in `layouts/menu.ts`                       |
| Colour palette | `FIELD_COLORS` / `MAX_COLOR_INDEX` in `components/colors.ts` |
| HTML toolbar   | `HTML_TOOLBAR_GROUPS` in `form/fields/html.ts`              |
| Role groups    | `ROLE_GROUP_LABELS` in `form/widget/userRolesSelection.ts`  |

A colour is stored as a **palette index 0..15**, mirroring a backend check constraint — growing
`FIELD_COLORS` is therefore a backend change too.

The only DI mechanism is `provide`/`inject` with a typed `InjectionKey`, and there is exactly one:
`FORM_CONTEXT`. Pinia is used for auth only.

## Routing and screens

Everything is in `app/src/router/index.ts`: one `routes` array, one `beforeEach` guard, one
`afterEach` setting `document.title`. Views are **statically imported** (only `HtmlField` is lazy).
`HOME_ROUTE` lives in `router/constants.ts` because the router imports every view, so a view
importing the router back would be a circular import.

`RouteMeta` is typed by module augmentation inside `router/index.ts`:

```ts
auth?: 'required' | 'none' | 'guest-only'   // default 'required'
permissions?: string[]                      // ALL must be held
title?: string
```

Two top-level `path: '/'` entries choose the layout: `AdminLayout` (the signed-in area) and
`BlankLayout` (`/`, `/diagnostic`, `/form-demo`, `/login`, `/403`, the catch-all).

### The per-resource three-route shape

Each resource declares **three sibling routes**, never nested under the list — a child route would
keep the list mounted and its `syncUrl` watcher would fight the form over the query string:

```
contacts        → ContactsView      [totem.contact.read]
contacts/new    → ContactFormView   [totem.contact.create]
contacts/:id    → ContactFormView   [totem.contact.read, totem.contact.update]
```

Paths mirror the API's own (`/contacts`, `/contact-tags`, `/website/menus`, `/website/pages`).
Names are kebab-case, singular for the forms: `contacts` / `contact-create` / `contact-edit`,
`website-menus` / `website-menu-create` / `website-menu-edit`, `settings-users` / … One component
serves create and edit; the difference is only the scopes.

### Adding a list screen

1. In `app/src/resources/<name>.ts`: a `Row` **type** (a `type`, not an `interface` — only aliases
   get the implicit index signature that `RelationRecord` and `ListFilters` need), a
   `<NAME>_LIST_FIELDS` array declared `as const satisfies readonly (keyof XxxRow)[]`, a
   `<NAME>_SORTABLE` list of what the backend accepts in `?ordering=`, a `Filters` type, and a
   three-line `listXxx()` calling `fetchList`.
2. In `app/src/views/<feature>/XxxView.vue`: a `FILTER_FIELDS` dict, then
   `useFilter<XxxFilters>(FILTER_FIELDS)` and `useResourceList({ fetchPage, filters, pageSize,
   sortField, sortable, syncUrl: true })` behind a PrimeVue `DataTable lazy paginator row-hover
   removable-sort data-key="id"`, with `<MultiRecordFilters>` as the `#header` toolbar, an
   `#empty` block, and `Skeleton` rows while `isInitialLoad`.
3. Three routes in `router/index.ts` with `meta.permissions`, and an entry in `layouts/menu.ts`.

Copy `views/contacts/ContactTagsView.vue` — it is the smallest complete example. Wrap permission
checks in a `computed`, never a bare `can()` in the template: `can()` instantiates the store on
every evaluation. `editRoute(id)` carries `route.query` along so Back returns to the same page.

### The filter bar

`components/list/MultiRecordFilters.vue` is the `#header` of every list: a search box, a **Filters**
button badged with the number of active filters, and a refresh button. The button opens a dialog
holding an ordinary `<Form>` with one `<Field>` per declared filter — which is the whole point of
`FilterType` being a **subset of `Widget`**: a filter form needed nothing added to the form
framework.

A screen declares its filters as data, keyed by the query parameter name — the SAME name in the URL
and in the request, so a link always describes the call behind it:

```ts
const FILTER_FIELDS: FilterFields = {
  search: { type: 'string', label: 'Search', help_text: 'Matches the login or the email.' },
  is_active: { type: 'boolean', label: 'Active', help_text: 'Keep the active accounts.' },
}
const { filters, setFilters, updateFilters, activeFilters } = useFilter<UserFilters>(FILTER_FIELDS)
```

`filters` goes straight to `useResourceList`. `setFilters` replaces the whole set (the dialog's
Apply, so emptying a control drops the filter), `updateFilters` merges a subset (the search box),
and `activeFilters` lists what is on **with `search` excluded** — its box is already on screen, so
counting it in the badge would claim a filter is hidden when it is not.

Two rules worth not rediscovering:

- **`useFilter` reads the URL, `useResourceList` writes it.** Page, page size, ordering and the
  filters share one query string and must be replaced in one `router.replace`; two writers would
  each preserve a stale copy of the other's keys. `useResourceList` then re-hydrates those keys
  from the same query string as RAW STRINGS, which is safe only because every consumer parses
  (`parseFilterValue`) — a boolean restored from a link arrives as `"false"`, a non-empty string.
- **Every declared key is present in `filters`, holding `null` when unset.** `useResourceList`
  reads `Object.keys(filters)` once, at creation, to know which parameters it owns; a key added
  later would never reach the URL and never be cleared from it.

The conversions live in `components/list/filters.ts`, Vue-free and with a spec, for the same reason
`fields/values.ts` does.

### Adding a form screen

`useResourceForm({ id, defaults, toForm, fetchOne, create, update, notFoundMessage, onSaved })`
holds everything that differs between create and edit; the view only declares its `<Field>`s.
Pass `id` as a **getter** (`() => route.params.id ? String(route.params.id) : null`): vue-router
reuses the component when only the param changes.

Payloads are built **key by key** in local `createPayload(values)` / `updatePayload(changed)`
helpers — never by copying the draft. See *the PATCH asymmetry* below for why that is not
pedantry. Deletes go through `useConfirm()`; the dialog is mounted once in `AdminLayout`.

`<Form>` works on a **copy** of `data`, keeps a baseline, and emits `save: [values, changed]` — a
create sends `values`, an update sends `changed`. It watches `props.data` on identity, never
deeply. Slots: `#default({ draft, dirty })` for the fields and `#actions({ invalid, dirty })` for
the buttons (submit is `:disabled="!isNew && !dirty"`). Fields declare themselves through
`provide`/`inject`; `Form.vue` cannot discover them any other way, they live in its slot.

## The generic form framework

### Where field types are registered — two places, both in `form/fields/`

1. The `Widget` union in `types.ts`: `string`, `boolean`, `text`, `integer`, `float`, `selection`,
   `date`, `datetime`, `color`, `many2one`, `many2many_tags`, `html`.
2. The `WIDGETS: Record<Widget, Component>` map in `Field.vue` — *"the one and only widget →
   component registry"*. The `Record<Widget, …>` type is deliberate: adding a member to the union
   without its component becomes a compile error rather than a blank field at runtime. An unknown
   widget at runtime renders an error `<Message>` in place instead of blanking the page.

`Field.vue` is the **only** bridge to the form context. A widget itself is an ordinary `v-model`
component — `defineProps<WidgetProps>()`, `emit('update:modelValue', …)`, injecting nothing — which
keeps it usable standalone, outside a `<Form>`.

### Adding a field widget

1. Add the name to `Widget` in `types.ts`, and document any new keys on `FieldOptions` (which is
   free-form `[key: string]: unknown` on purpose: that is the extension point, not a fixed schema).
2. Put every non-trivial decision in a sibling **Vue-free** `.ts` (`values.ts`, `many2one.ts`,
   `many2many.ts`, `html.ts`, `fieldSwitch.ts`) with a `.spec.ts` next to it. Tests run in
   `environment: 'node'`, so such a module must not import Vue, PrimeVue or TipTap — that is
   exactly why the extension list was split out into `htmlExtensions.ts`.
3. Write `XxxField.vue` wrapped in `FieldWrapper` (label, `*`, help, error), with `useId()` for the
   `input-id`. When there is no single focusable element (`ColorIntegerField`, `BooleanField`), omit
   `input-id` and use `v-slot="{ labelId }"` with `role="radiogroup"` + `aria-labelledby`.
   `CharField.vue` is the canonical minimal example.
4. Register it in `Field.vue`'s `WIDGETS`.
5. Exercise it on `/form-demo` (`views/FormDemoView.vue`, `auth: 'none'`, absent from the menu),
   which runs the whole framework with no backend and no session.

### Invariants every widget must hold

- **An empty scalar field is `null`** — never `''`, never `NaN`, never `undefined`, and for `html`
  never the `"<p></p>"` ProseMirror serialises an untouched document as. A list-valued field is
  empty at `[]`, never `null`.
- **A list-valued widget never mutates its value in place; it emits a new array.** `Form.vue` keeps
  its baseline as a shallow copy, so an in-place `push` would edit the baseline too and the field
  would read as permanently untouched.
- `isEmpty` in `values.ts` is the definition of empty: `false` and `0` are *filled* values. Never
  use a truthiness test — that is the classic `required` bug.
- `sameFieldValue` compares lists as **sets**: a many-to-many has no order, the backend accepts the
  ids in any, and the widget rebuilds the array on every pick.

Static imports only, with one deliberate exception: `html` is `defineAsyncComponent`, because
TipTap and prosemirror are ~130 kB gzipped and `router/index.ts` imports every view statically — a
static import would put a rich-text editor in the login page's entry chunk. It is safe only because
`Field.vue`'s `register()` is synchronous.

`FieldSwitch` is adjacent but **not** a widget: it picks between mutually exclusive fields (`page`
vs `link` on a website menu) when the backend stores no discriminator. It is purely visual, its
value is not data, and it registers no key.

## The API and its error contract

`app/src/api/client.ts` — `apiFetch`, `postJson`, `patchJson`, `apiDelete`, `ApiError`,
`NON_FIELD = '__all__'`; base `/api/v1`.

- **Every path keeps its trailing slash.** The backend requires it.
- `Content-Type: application/json` is set only for a *string* body, so a `FormData` body keeps the
  browser's multipart boundary.
- `ApiError.fields` carries per-field messages from a 422, keyed by the **public** API name
  (`login`, never the ORM's `username`). Errors with no field land under `NON_FIELD` and are shown
  by the parent's banner, not by `<Form>`.
- **There is no refresh-on-401** — a 401 surfaces to the caller. See *Known open items*.

`app/src/api/list.ts` — `Page<T>` (`{count, next, previous, results}`), `ListQuery`, the parameter
names (`page`, `page_size`, `ordering`, `fields`), `MAX_PAGE_SIZE = 199` (the schema says
`exclusiveMaximum: 200`), `readListQuery` for URL restore, `fetchAllPages` (capped at 10 pages).
`next` is only *tested*, never dereferenced: it is an absolute URL and `apiFetch` prefixes
`/api/v1`.

**The PATCH asymmetry — read `app/src/resources/users.ts` before touching any update payload.**
The backend deserialises with `exclude_unset=True`: an omitted key is left untouched, an explicit
`null` is written. So echoing a field back is *not* a no-op. On users specifically, echoing `roles`
wipes them, and merely *mentioning* `user_type` fires `user_change_rights` and invalidates the
account's tokens — signing the user out. Never build a PATCH body by copying the draft; send
`changed`, which is what `<Form>` emits for exactly this reason.

List responses are serialised with `exclude_unset=True` too: only the keys named in `?fields=` come
back. That is why `LIST_FIELDS` uses `satisfies` — a typo becomes a compile error instead of a
silently missing column.

Wire keys stay **snake_case** (`first_name`, `date_published`, `new_window`) and are never renamed
client-side. Per-resource type naming: `XxxRow`, `XxxDetail`, `XxxRef`, `XxxFilters`,
`XxxCreatePayload`, `XxxUpdatePayload = Partial<XxxCreatePayload>`.

## Auth and permissions

OAuth2 resource-owner-password against `POST /o/token/`. The token is **opaque** — nothing to
decode client-side — and lives in `localStorage` entirely behind `auth/tokenStorage.ts`.
`oauth.ts` uses plain `fetch` rather than the API client on purpose, so a failed login cannot
recursively trigger session teardown; it also distinguishes `invalid_grant` (bad credentials) from
`invalid_client` (the OAuth app is missing from the DB — a deployment problem).

Holding a token is not the same as having a session: the guard calls `ensureSession()`, which
validates the token against `GET /api/v1/users/me/` once per session. A 401 there means a silent
logout; a network error or 5xx is rethrown and must **not** log the user out.

**Permissions are the OAuth scopes** (`totem.contact.read`, `totem.user.update`, …), read from the
token response at login and exposed by `auth/permissions.ts` (`can`, `canAny`, `canAll`). They act
in two places, both purely cosmetic: `layouts/menu.ts` hides entries whose permission is missing
(and drops a section left empty), and the guard sends an authenticated-but-unauthorised user to
`/403` rather than `/login`, which would be a dead end.

**This is not a security boundary** — the backend checks the same scopes on every request. And
because the scope is read at login, **a role change requires a re-login** to show up.

Dev credentials: `admin` / `admin`.

## Configuration: build time vs runtime

**Every `VITE_*` variable is inlined into the bundle at build time.** They are not runtime
configuration and not secrets. One image serves every tenant, so nothing tenant-specific (slug,
branding, feature flags) may ever live there — it would be frozen for all domains. Such values
must come from the backend at runtime.

`default.env` holds the committed dev defaults; `.env` is gitignored. `app/env.d.ts` declares the
only two variables the bundle reads: `VITE_APP_TITLE` and `VITE_OAUTH_CLIENT_ID` (a public
identifier by construction — it ships in the JS).

`base` is `/tabou/`, a name inherited from another project, and it is **frozen at build time**
(Vite rewrites every asset URL) — which is why it is a build arg in `docker-compose.yml` and not
an environment variable. `/tabou/diagnostic` prints the prefix actually baked in.

In production `totem-proxy` serves this app under `/tabou/` on the tenant domain and routes every
other path to the tenant backend — hence relative URLs and no CORS. The dev server reproduces that
same-origin arrangement itself: `/api`, `/o`, `/admin`, `/static` → `totem-backend:8000`, and
`/media` → `totem-backend-nginx:80`. That last one is not a typo: Django's only `/media/` route
refuses any URL without a `signature` param and answers with an HTML 403, so proxying an
`<img src="/media/public/…">` to Django just breaks, with nothing useful in the console.

The nginx container's name and port (`totem-frontend`, `3006`) are a **contract** with
`totem-proxy`'s `domain` table. Renaming either breaks tenant routing.

## Testing

Vitest, configured inline in `app/vite.config.ts`: `environment: 'node'`,
`include: ['src/**/*.spec.ts']`. **No jsdom, no `@vue/test-utils`, no component mounting** — and
that is a design constraint, not a gap. Every treacherous piece of logic is deliberately extracted
into a Vue-free `.ts` module so it can be tested without a DOM:

| Component                      | Its testable logic      |
| ------------------------------ | ----------------------- |
| `ManyToOneField.vue`           | `many2one.ts`           |
| `ManyToManyTagsField.vue`      | `many2many.ts`          |
| `HtmlField.vue`                | `html.ts`               |
| `FieldSwitch.vue`              | `fieldSwitch.ts`        |
| `UserRolesSelectionWidget.vue` | `userRolesSelection.ts` |
| `MultiRecordFilters.vue`       | `list/filters.ts`       |
| `ColorTag.vue`                 | `colors.ts`             |
| every field                    | `fields/values.ts`      |

Follow that split for anything new: if a bug would stay invisible until a user hits it, its logic
belongs in a sibling `.ts` with a `.spec.ts`. Specs sit next to their module and import it
relatively (`from './list'`); no `beforeEach` fetch mocking anywhere.

Behaviours already covered and worth not regressing: out-of-order list responses are discarded (the
older one losing the race must not contradict the sort arrow); a `?page=` past the last page answers
404 and falls back to page 1; the URL is read *before* the state is created, so F5 costs one
request; and the URL is written with `router.replace`, never `push`, so sorting does not fill the
history.

## Style

`<script setup lang="ts">` everywhere; no class components, no Options API. Single quotes in TS,
**double quotes in templates**, no semicolons, 2-space indent, ~100 columns, trailing commas in
multiline literals. Explicit return types on every function, including `: void`.

Imports in three groups separated by blank lines: third-party (`primevue/*`, then `vue` /
`vue-router`), then `@/…` (the alias for `app/src`), then relative `./` siblings. Anything crossing
a folder boundary uses `@/`; siblings inside `form/fields/` are relative. `verbatimModuleSyntax`
and `isolatedModules` are on, so `import type` / inline `type` specifiers are **mandatory** for
type-only imports.

Naming: `PascalCase.vue` for components, `camelCase.ts` for modules, `XxxView.vue` for routed views
and `XxxFormView.vue` for their create/edit sibling, `XxxField.vue` for a registry widget,
`XxxWidget.vue` for a detached one. `SCREAMING_SNAKE` for module-level constants. Template props
are kebab-case (`:model-value`, `:save-label`, `data-key`) even though the TS side is camelCase.

TypeScript is strict, with `noUnusedLocals` and `noUnusedParameters` — a dead local fails the
build, not just the review.

Comment style, and it is distinctive: emphasis is written in CAPS (`NEVER`, `ONLY`, `INVARIANT`),
and em-dashes are written `--`.

### CSS

Plain CSS — **no SCSS, no Tailwind, no CSS modules**. One global stylesheet, `src/styles/main.css`,
imported from `main.ts`, holding **app chrome only** (`:root` variables, topbar, sidebar, content,
`.page__*`, a few utilities), sectioned by banner comments. Everything else is `<style scoped>` in
the SFC; `HtmlField.vue` is the only unscoped one, because it styles ProseMirror-owned DOM.

Class names are BEM-ish with a double underscore: `.page__header`, `.form__fields`,
`.field__required`, `.colors__swatch--selected`.

**Never a raw hex value.** Colours come from PrimeVue variables (`--p-surface-*`,
`--p-primary-color`, `--p-red-500`, `--p-content-border-color`) plus app-level aliases defined once
in `main.css` (`--app-bg`, `--app-panel`, `--app-border`, `--app-text`, `--app-muted`,
`--app-inset`, `--topbar-height`, `--sidebar-width`) and redefined under `:root.app-dark`.
`useTheme.ts` toggles `.app-dark` on `<html>` and persists to `localStorage`. Note that
`--app-inset` is global on purpose: a scoped `:global(html.app-dark) .x` does not compile to what
it reads like. `:deep()` is how PrimeVue internals are reached.

## Commit messages

`[TAG] scope: lowercase summary`, with `[INIT]`, `[ADD]`, `[IMP]`, `[REF]`, `[FIX]` and a scope like
`app:`, `auth:` or `repo:`.

The body is the point, and this repo sets a high bar for it: several paragraphs of prose explaining
why the change is shaped this way, which alternative was rejected, and what failure mode it would
have had. Read `git log -1` for the standard before writing one.

## Gotchas

- **Dependencies live in a named Docker volume, not in `app/node_modules` on disk**, and the volume
  is not refreshed when `package.json` changes. After any branch switch: `make install`, then
  `make clean` if that is not enough. `docs/commands.md` calls this the number-one cause of "works
  on my machine".
- `network totem-saas-network … could not be found` → that network belongs to `totem-proxy`: start
  that stack, or `docker network create totem-saas-network`.
- A blank page behind the proxy with 404s on `/assets/…` → the baked-in base path does not match
  what the proxy serves. Check `VITE_BASE_PATH` and rebuild.
- Login failing with "unknown OAuth client" → the backend's `oauth_oauthapp` table is empty; it
  needs `manage.py populate` (the owner runs it).
- A change to the proxy's `domain` table looks ignored → 30 s Lua cache,
  `curl -X POST http://localhost:9999/_saas/flush-cache`.
- HMR not reacting → only on Docker Desktop or WSL2 with the repo on `/mnt/c`; set
  `VITE_USE_POLLING=1`. It costs real CPU, so leave it off on Linux.
- Behind the proxy the HMR websocket cannot upgrade, so the console shows WebSocket failures. They
  are harmless.

## Known open items

From `README.md`'s "Prochaines étapes", plus one deferred refactor:

1. Map 422 responses onto the user form's fields.
2. Replace the hand-written API client with one generated from `/api/v1/openapi.json`.
3. Automatic token refresh — **blocked on the backend**, which sets `REFRESH_TOKEN_EXPIRE_SECONDS`
   (5 h) shorter than `ACCESS_TOKEN_EXPIRE_SECONDS` (10 h), so the refresh token always dies before
   the token it should renew. Fix that first.
4. A `src/modules/<feature>/` split (`api/`, `components/`, `views/`, `routes.ts`, `menu.ts`) so a
   resource's table or form can open in a modal from anywhere, with `views/` owning the router and
   `components/` receiving props only. Designed and agreed, then **deliberately postponed** — do
   not start it as a side effect of another task.

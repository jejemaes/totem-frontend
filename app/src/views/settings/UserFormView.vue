<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import UserRolesSelectionWidget from '@/components/form/widget/UserRolesSelectionWidget.vue'
import { sameRoleIds } from '@/components/form/widget/userRolesSelection'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createUser,
  fetchUser,
  updateUser,
  type UserCreatePayload,
  type UserDetail,
  type UserLanguage,
  type UserUpdatePayload,
} from '@/resources/users'

/*
 * One screen for both routes: /settings/users/new and /settings/users/:id.
 * `useResourceForm` owns everything that differs -- loading the record, POST
 * versus PATCH, the error mapping -- so what is left here is the field list
 * and the two labels that change.
 */
const router = useRouter()
const route = useRoute()

/**
 * The list's own query (page, ordering, search) rides along on this screen's
 * URL, so Cancel and the post-save redirect land on the list the user actually
 * left -- and so a reload, or a shared link, still knows where "back" leads.
 */
const listRoute = computed(() => ({ name: 'settings-users', query: route.query }))

/*
 * The roles live here rather than in the <Form> draft.
 *
 * UserRolesSelectionWidget is not a <Field> -- its value is a list of ids, and
 * a FieldValue is a primitive -- so it registers nothing and <Form> knows
 * nothing about it. Everything <Form> would have done is therefore explicit
 * below: seeding on load (`onLoaded`), telling an edit from an untouched list
 * (`rolesDirty`), enabling Save, and reaching the payload.
 */
const roleIds = ref<string[]>([])

/** What the record carried, to tell an edit from an untouched list. */
const roleBaseline = ref<string[]>([])

/** A set comparison: the widget rebuilds the list on every pick, and the order
    carries no meaning. */
const rolesDirty = computed(() => !sameRoleIds(roleIds.value, roleBaseline.value))

/** `FieldValue` is wider than the payload accepts: these five fields only ever
    produce strings, but the type does not say so. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/** A total function into UserLanguage: no cast, and anything outside the two
    offered choices falls back on the backend's own default. */
function language(value: unknown): UserLanguage {
  return value === 'en-us' ? 'en-us' : 'fr'
}

/*
 * Both payloads are built key by key, never by copying the draft.
 *
 * What is NOT sent matters as much. `user_type` and `avatar` are omitted from
 * both: on create so the backend applies its defaults, on update because
 * omitting them is what LEAVES THEM ALONE -- the backend builds its update with
 * `exclude_unset=True`, and the mere presence of `user_type` invalidates the
 * account's tokens. `roles` is the opposite case and the delicate one: always
 * sent on create, sent on update only when the widget's value moved, because
 * `roles: []` wipes the account's roles.
 */
function createPayload(values: FormData): UserCreatePayload {
  return {
    login: text(values.login) ?? '',
    email: text(values.email) ?? '',
    first_name: text(values.first_name),
    last_name: text(values.last_name),
    language: language(values.language),
    // A fresh array: the payload must not alias the widget's live value.
    roles: [...roleIds.value],
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH -- the same
 * omitted-means-untouched rule that protects `roles` also means an untouched
 * field must not be echoed back.
 */
function updatePayload(changed: FormData): UserUpdatePayload {
  const body: UserUpdatePayload = {}
  if ('login' in changed) body.login = text(changed.login) ?? ''
  if ('email' in changed) body.email = text(changed.email) ?? ''
  if ('first_name' in changed) body.first_name = text(changed.first_name)
  if ('last_name' in changed) body.last_name = text(changed.last_name)
  if ('language' in changed) body.language = language(changed.language)

  // Read from the ref, not from `changed`: the roles were never in the draft.
  // Present ONLY when the dropdowns actually moved -- an omitted key leaves the
  // account's roles alone, where `roles: []` wipes them. Clearing every
  // dropdown IS that wipe, deliberately. Without the totem.userrole.read
  // permission the widget never renders, the value never moves, and `roles`
  // therefore never reaches the body.
  if (rolesDirty.value) body.roles = [...roleIds.value]

  return body
}

const form = useResourceForm<UserDetail>({
  // A getter, not a plain value: vue-router reuses this component when only
  // the param changes. `undefined` on the create route.
  id: () => (route.params.id ? String(route.params.id) : null),
  defaults: {
    login: null,
    email: null,
    first_name: null,
    last_name: null,
    // The backend refuses an explicit null here, so the form never offers one.
    language: 'fr',
  },
  toForm: (user) => ({
    login: user.login,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    language: language(user.language),
  }),
  fetchOne: fetchUser,
  // <Form> re-seeds its draft when `data` changes identity; nothing would
  // re-seed a value living outside it. This is that, for the roles widget --
  // without it, walking from one user to the next keeps the previous account's
  // roles on screen and one careless Save moves them.
  onLoaded: (user) => {
    roleBaseline.value = user ? (user.roles ?? []).map((role) => role.id) : []
    roleIds.value = [...roleBaseline.value]
  },
  // An edit confined to the dropdowns leaves `changed` empty, and an empty
  // `changed` makes useResourceForm skip the PATCH entirely.
  hasExternalChanges: () => rolesDirty.value,
  create: (values) => createUser(createPayload(values)),
  update: (id, changed) => updateUser(id, updatePayload(changed)),
  notFoundMessage: 'This user no longer exists.',
  onSaved: (user, mode) =>
    router.push(
      mode === 'create'
        ? // The backend's `search` matches login OR email, so the list opens on
          // the row just created. Without it, with the default login-ascending
          // sort and ten rows per page, a new account can land on page 3 and
          // the redirect looks like nothing happened.
          { name: 'settings-users', query: { search: user.login } }
        : listRoute.value,
    ),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

/** The login is the account's identity, so it titles the page once loaded. */
const title = computed(() => (isNew.value ? 'New user' : (text(data.value?.login ?? null) ?? 'User')))
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="page__subtitle">
          <template v-if="isNew">
            Roles can be granted right away: permissions are the union of them.
          </template>
          <template v-else>The account status is not editable here.</template>
        </p>
      </div>
    </header>

    <Message v-if="loadError" severity="error" :closable="false" class="page__message">
      <div class="page__error">
        <span>{{ loadError }}</span>
        <RouterLink :to="listRoute">
          <Button label="Back to the list" size="small" severity="danger" outlined />
        </RouterLink>
      </div>
    </Message>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      {{ error }}
    </Message>

    <Card v-if="!loadError" class="user-form">
      <template #content>
        <!-- Placeholders with the form's real shape, so the card does not jump
             when the record lands. -->
        <div v-if="loading" class="user-form__skeleton">
          <Skeleton v-for="n in 6" :key="n" height="3.2rem" />
        </div>

        <Form
          v-else-if="data"
          :data="data"
          :save-label="saveLabel"
          :saving="saving"
          :errors="fieldErrors"
          @save="form.save"
        >
          <template #default="{ draft }">
            <Field
              name="login"
              widget="string"
              label="Login"
              required
              :options="{ maxLength: 255, placeholder: 'jdoe' }"
              help="Used to sign in. It must be unique."
            />

            <Field
              name="email"
              widget="string"
              label="Email"
              required
              :options="{ maxLength: 255, placeholder: 'jane.doe@example.com' }"
            />

            <Field name="first_name" widget="string" label="First name" :options="{ maxLength: 255 }" />

            <Field name="last_name" widget="string" label="Last name" :options="{ maxLength: 255 }" />

            <Field
              name="language"
              widget="selection"
              label="Language"
              required
              :options="{
                choices: [
                  { value: 'fr', label: 'French' },
                  { value: 'en-us', label: 'English' },
                ],
              }"
              help="Interface language for this account."
            />

            <!-- Not a <Field>: its value is a list of role ids, which the
                 <Field> system cannot carry. It is passed `draft` for the same
                 reason a widget receives `values` -- so a rule can depend on a
                 sibling -- and everything <Field> would have forwarded is
                 explicit here: the lock during a save, and the server error,
                 which <Form> can only route to a registered field. -->
            <UserRolesSelectionWidget
              v-model="roleIds"
              :values="draft"
              label="Roles"
              help="One role per category. Permissions are the union of the roles granted."
              :readonly="saving"
              :invalid="Boolean(fieldErrors.roles)"
              :error="fieldErrors.roles"
            />
          </template>

          <template #actions="{ dirty }">
            <RouterLink :to="listRoute">
              <Button label="Cancel" severity="secondary" text :disabled="saving" />
            </RouterLink>
            <!-- Nothing edited means nothing to PATCH, so on an existing
                 record Save has no work to do. A create always has.
                 `rolesDirty` is OR-ed in because the roles widget lives outside
                 the draft, so <Form>'s own `dirty` cannot see it. -->
            <Button
              type="submit"
              :label="saveLabel"
              icon="pi pi-check"
              :loading="saving"
              :disabled="!isNew && !dirty && !rolesDirty"
            />
          </template>
        </Form>
      </template>
    </Card>
  </section>
</template>

<style scoped>
/* A full-width form is unreadable: the fields themselves are short. */
.user-form {
  max-width: 36rem;
}

.user-form__skeleton {
  display: grid;
  gap: 1rem;
}

.page__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

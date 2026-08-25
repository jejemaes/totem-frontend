<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
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
 * What is NOT sent matters as much. On create, `roles: []` is added by
 * `createUser` and `user_type`/`avatar` are omitted so the backend applies its
 * defaults. On update, omitting them is what LEAVES THEM ALONE: the backend
 * builds its update with `exclude_unset=True`, so an omitted key is untouched
 * while `roles: []` would wipe the account's roles and the mere presence of
 * `user_type` would invalidate its tokens.
 */
function createPayload(values: FormData): UserCreatePayload {
  return {
    login: text(values.login) ?? '',
    email: text(values.email) ?? '',
    first_name: text(values.first_name),
    last_name: text(values.last_name),
    language: language(values.language),
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
            The account is created with no role: permissions are granted afterwards.
          </template>
          <template v-else>Roles and account status are not editable here.</template>
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
          <Skeleton v-for="n in 5" :key="n" height="3.2rem" />
        </div>

        <Form
          v-else-if="data"
          :data="data"
          :save-label="saveLabel"
          :saving="saving"
          :errors="fieldErrors"
          @save="form.save"
        >
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

          <template #actions="{ dirty }">
            <RouterLink :to="listRoute">
              <Button label="Cancel" severity="secondary" text :disabled="saving" />
            </RouterLink>
            <!-- Nothing edited means nothing to PATCH, so on an existing
                 record Save has no work to do. A create always has. -->
            <Button
              type="submit"
              :label="saveLabel"
              icon="pi pi-check"
              :loading="saving"
              :disabled="!isNew && !dirty"
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

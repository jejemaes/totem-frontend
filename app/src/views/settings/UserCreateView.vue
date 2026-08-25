<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, NON_FIELD } from '@/api/client'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import { createUser } from '@/resources/users'

const router = useRouter()

/*
 * Keys absent from here are absent from the payload: `roles` is injected by
 * `createUser`, and `user_type` and `avatar` are not sent at all. `language`
 * carries 'fr' from the start -- the backend refuses an explicit null.
 *
 * A plain object rather than a `ref`: its identity never changes, and <Form>
 * only re-seeds its draft on a new object.
 */
const data: FormData = {
  login: null,
  email: null,
  first_name: null,
  last_name: null,
  language: 'fr',
}

const saving = ref(false)
const error = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})

/** `FieldValue` is wider than the payload accepts: the five fields here only
    ever produce strings, but the type does not say so. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

async function onSave(values: FormData): Promise<void> {
  saving.value = true
  error.value = null
  fieldErrors.value = {}

  // The `?? ''` fallbacks are unreachable -- <Form> blocks the submit while a
  // required field is empty -- but they avoid a type assertion, and degrade
  // into a readable 422 rather than a silent `undefined`.
  const login = text(values.login) ?? ''

  try {
    await createUser({
      login,
      email: text(values.email) ?? '',
      first_name: text(values.first_name),
      last_name: text(values.last_name),
      // A total function into UserLanguage: no cast, and the impossible case
      // falls back on the backend's own default.
      language: values.language === 'en-us' ? 'en-us' : 'fr',
    })

    // The backend's `search` matches login OR email, so the list opens on the
    // single row just created. Without it, with the default login-ascending
    // sort and ten rows per page, a new account can land on page 3 and the
    // redirect looks like nothing happened.
    await router.push({ name: 'settings-users', query: { search: login } })
  } catch (caught) {
    if (caught instanceof ApiError) {
      fieldErrors.value = caught.fields ?? {}
      // `__all__` carries what the backend could not attach to a field --
      // typically a duplicate login, caught by a uniqueness constraint in the
      // database rather than by a field validator. Field errors, meanwhile,
      // are already shown under their fields, so the banner does not repeat
      // them.
      error.value =
        caught.fields?.[NON_FIELD] ??
        (Object.keys(caught.fields ?? {}).length
          ? 'Please fix the fields in error.'
          : caught.message)
    } else {
      error.value = 'Could not save.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>New user</h1>
        <p class="page__subtitle">
          The account is created with no role: permissions are granted afterwards.
        </p>
      </div>
    </header>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      {{ error }}
    </Message>

    <Card class="user-form">
      <template #content>
        <Form
          :data="data"
          save-label="Create"
          :saving="saving"
          :errors="fieldErrors"
          @save="onSave"
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

          <template #actions>
            <RouterLink to="/settings/users">
              <Button label="Cancel" severity="secondary" text :disabled="saving" />
            </RouterLink>
            <Button type="submit" label="Create" icon="pi pi-check" :loading="saving" />
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
</style>

<script setup lang="ts">
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm, type ResourceForm } from '@/composables/useResourceForm'
import {
  fetchProfile,
  updateProfile,
  type ProfileUpdatePayload,
  type UserProfile,
} from '@/resources/profile'
import type { UserLanguage } from '@/resources/users'

/*
 * The signed-in account's own profile, with NO router: every way out is an
 * event, so the routed page decides what a save means for the rest of the app.
 *
 * A SINGLETON form, shaped like the website configuration: the record is
 * addressed as `/users/me/`, so `id` is a constant and `isNew` is always false,
 * there is no Cancel (nowhere to go back to) and no Delete. A save stays here,
 * as on every form: the composable re-seeds it from the PATCH response.
 *
 * The fields are UserFormView's minus the roles: the profile carries none, and
 * a user granting themself rights is precisely what this endpoint must not do.
 */
const emit = defineEmits<{
  saved: [profile: UserProfile]
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

/** The `/me/` alias, as an id: useResourceForm needs one, the URL has none. */
const ME = 'me'

/** `FieldValue` is wider than the payload accepts: these fields only ever
    produce strings, but the type does not say so. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/** A total function into UserLanguage: anything outside the two offered
    choices falls back on the backend's own default. */
function language(value: unknown): UserLanguage {
  return value === 'en-us' ? 'en-us' : 'fr'
}

function toForm(profile: UserProfile): FormData {
  return {
    login: profile.login,
    email: profile.email,
    first_name: profile.first_name,
    last_name: profile.last_name,
    language: language(profile.language),
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH: the backend writes
 * what it is sent, so echoing an untouched field back is not a no-op.
 */
function updatePayload(changed: FormData): ProfileUpdatePayload {
  const body: ProfileUpdatePayload = {}
  if ('login' in changed) body.login = text(changed.login) ?? ''
  if ('email' in changed) body.email = text(changed.email) ?? ''
  if ('first_name' in changed) body.first_name = text(changed.first_name)
  if ('last_name' in changed) body.last_name = text(changed.last_name)
  if ('language' in changed) body.language = language(changed.language)
  return body
}

const form: ResourceForm = useResourceForm<UserProfile>({
  id: () => ME,
  defaults: {
    login: null,
    email: null,
    first_name: null,
    last_name: null,
    language: 'fr',
  },
  toForm,
  fetchOne: (_id, signal) => fetchProfile(signal),
  // Required by the composable's contract and UNREACHABLE: `id` is a constant,
  // so `save` always takes the update branch. An account is not created here.
  create: () => Promise.reject(new Error('A profile cannot be created.')),
  update: (_id, changed) => updateProfile(updatePayload(changed)),
  notFoundMessage: 'Your profile could not be found.',
  onSaved: (profile) => emit('saved', profile),
})
</script>

<template>
  <FormView
    :form="form"
    title="My profile"
    width="narrow"
    :skeleton="5"
    :cancellable="false"
    @title="emit('title', $event)"
  >
    <Field
      name="login"
      widget="string"
      label="Login"
      required
      :options="{ maxLength: 255 }"
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
    />
  </FormView>
</template>

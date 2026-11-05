<script setup lang="ts">
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import { newPasswordErrors } from '@/components/form/fields/password'
import type { FieldValue } from '@/components/form/fields/types'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm, type ResourceForm } from '@/composables/useResourceForm'
import { changeMyPassword, type ProfilePasswordChangePayload } from '@/resources/profile'
import { PASSWORD_PATTERN, PASSWORD_PATTERN_MESSAGE } from '@/resources/users'

/*
 * The signed-in account changing its OWN password, with no router: meant for a
 * Dialog, every way out is an event.
 *
 * Kept apart from UserPasswordView rather than one view with a "self" flag:
 * the two hit different endpoints under different rights, and this one asks
 * for the current password -- the proof that the owner is typing, not whoever
 * found the session unlocked. A flag would put that field one boolean away
 * from vanishing on the wrong screen.
 *
 * Built on useResourceForm although there is no record: with a null `id` its
 * `save` always takes the create branch, and that is what brings the banners
 * and the routing of a 422 onto `old_password` / `new_password` for free.
 */
const emit = defineEmits<{
  saved: []
  cancel: []
  /** The heading for whoever frames this form -- a Dialog's header. */
  title: [title: string]
}>()

const PATTERN = { pattern: PASSWORD_PATTERN, patternMessage: PASSWORD_PATTERN_MESSAGE }

/** Every field here only ever produces a string; the type does not say so. */
function text(value: FieldValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/** Key by key, never the draft: `confirm_password` is the form's own and is
    not part of the body. */
function createPayload(values: FormData): ProfilePasswordChangePayload {
  return {
    old_password: text(values.old_password),
    new_password: text(values.new_password),
  }
}

const form: ResourceForm = useResourceForm<void>({
  id: () => null,
  defaults: { old_password: null, new_password: null, confirm_password: null },
  toForm: () => ({}),
  create: (values) => changeMyPassword(createPayload(values)),
  // UNREACHABLE: `id` is always null, so `save` always creates.
  update: () => Promise.reject(new Error('A password is not edited, it is replaced.')),
  onSaved: () => emit('saved'),
})

/**
 * Refuses what the browser can already tell is wrong -- a pattern mismatch, a
 * confirmation that differs -- without a request. Written to `fieldErrors` as a
 * NEW object, which is what makes <Form> re-read them.
 */
function onSave(values: FormData): void {
  const errors = newPasswordErrors(values, PATTERN)
  if (Object.keys(errors).length) {
    form.fieldErrors.value = errors
    return
  }
  void form.save(values)
}
</script>

<template>
  <FormView
    :form="form"
    title="Change password"
    mode="dialog"
    create-label="Change password"
    :skeleton="3"
    :on-save="onSave"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <Field
      name="old_password"
      widget="password"
      label="Current password"
      required
      :options="{ autocomplete: 'current-password' }"
    />

    <Field
      name="new_password"
      widget="password"
      label="New password"
      required
      :options="{ ...PATTERN, autocomplete: 'new-password' }"
      :help="PASSWORD_PATTERN_MESSAGE"
    />

    <Field
      name="confirm_password"
      widget="password"
      label="Confirm new password"
      required
      :options="{ autocomplete: 'new-password' }"
    />
  </FormView>
</template>

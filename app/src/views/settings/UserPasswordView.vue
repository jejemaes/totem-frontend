<script setup lang="ts">
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import { newPasswordErrors } from '@/components/form/fields/password'
import type { FieldValue } from '@/components/form/fields/types'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm, type ResourceForm } from '@/composables/useResourceForm'
import {
  PASSWORD_PATTERN,
  PASSWORD_PATTERN_MESSAGE,
  setUserPassword,
  type UserPasswordSetPayload,
} from '@/resources/users'

/*
 * An administrator setting the password of a user they manage, with no
 * router: meant for a Dialog, every way out is an event.
 *
 * No "current password" field, and that is the difference with
 * ProfilePasswordView: the administrator does not know it, and the
 * `totem.user.password` scope is the proof. Kept as a separate view rather
 * than a flag on that one -- see there.
 *
 * The confirmation matters MORE here than on one's own password: whoever
 * mistypes it is not the one who gets locked out.
 */
const props = defineProps<{
  /** Fixed for the life of the view: the host remounts it per open (`:key`). */
  userId: string
}>()

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

/** Key by key, never the draft: `confirm_password` is not part of the body. */
function createPayload(values: FormData): UserPasswordSetPayload {
  return { new_password: text(values.new_password) }
}

const form: ResourceForm = useResourceForm<void>({
  // The record's id is `userId`, but it is NOT this form's: passing it would
  // send `save` down the update branch and `fetchOne` after a record.
  id: () => null,
  defaults: { new_password: null, confirm_password: null },
  toForm: () => ({}),
  create: (values) => setUserPassword(props.userId, createPayload(values)),
  // UNREACHABLE: `id` is always null, so `save` always creates.
  update: () => Promise.reject(new Error('A password is not edited, it is replaced.')),
  onSaved: () => emit('saved'),
})

/** Same refusal as ProfilePasswordView's, from the same function. */
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
    title="Set password"
    mode="dialog"
    create-label="Change password"
    :skeleton="2"
    :on-save="onSave"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
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

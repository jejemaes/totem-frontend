<script setup lang="ts">
import { computed } from 'vue'

import { MAX_COLOR_INDEX } from '@/components/colors'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createContactTag,
  fetchContactTag,
  updateContactTag,
  type ContactTagCreatePayload,
  type ContactTagDetail,
  type ContactTagUpdatePayload,
} from '@/resources/contactTags'

/*
 * The tag form, for both creating and editing, and with NO router: the record
 * comes in as the `id` prop and every way out (saved, cancelled, gone) is an
 * event. The routed page turns those into navigation; a Dialog turns them into
 * closing itself. Two fields, so this is the smallest possible use of the form
 * machinery.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [tag: ContactTagDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /**
   * The heading for whoever frames this form -- a page's <h1>, a Dialog's
   * header. It depends on the loaded record, so only the view can compute it.
   */
  title: [title: string]
}>()

function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * A palette index, clamped to what both sides accept.
 *
 * The backend enforces 0..15 with a check constraint, so an out-of-range value
 * is a 422 rather than a stored oddity; the widget cannot produce one, but the
 * payload builder is what the backend actually sees.
 */
function colorIndex(value: FieldValue): number {
  const parsed = toNumberOrNull(value) ?? 0
  return Math.min(Math.max(0, Math.trunc(parsed)), MAX_COLOR_INDEX)
}

function createPayload(values: FormData): ContactTagCreatePayload {
  return {
    name: text(values.name) ?? '',
    color: colorIndex(values.color),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): ContactTagUpdatePayload {
  const body: ContactTagUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('color' in changed) body.color = colorIndex(changed.color)
  return body
}

const form = useResourceForm<ContactTagDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // The model's own default. `null` is not a legal colour, so the form never
  // offers one -- and a new tag opens on the first swatch rather than on none.
  defaults: { name: null, color: 0 },
  toForm: (tag) => ({ name: tag.name, color: tag.color }),
  fetchOne: fetchContactTag,
  create: (values) => createContactTag(createPayload(values)),
  update: (id, changed) => updateContactTag(id, updatePayload(changed)),
  notFoundMessage: 'This tag no longer exists.',
  onSaved: (tag, mode) => emit('saved', tag, mode),
})

const { isNew, data } = form

const title = computed(() =>
  isNew.value ? 'New tag' : (text(data.value?.name ?? null) ?? 'Tag'),
)
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="2"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <!-- Unique across the instance: a duplicate comes back as a field
         error on this very field, which <Form> shows in place. -->
    <Field
      name="name"
      widget="string"
      label="Name"
      required
      :options="{ maxLength: 255, placeholder: 'Customer' }"
      help="Must be unique."
    />

    <!-- The value is an index into the shared palette, not a CSS
         colour: `max` mirrors the backend's own check constraint. -->
    <Field
      name="color"
      widget="color"
      label="Colour"
      required
      :options="{ max: MAX_COLOR_INDEX }"
    />
  </FormView>
</template>

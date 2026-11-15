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
  createDocumentTagCategory,
  deleteDocumentTagCategory,
  fetchDocumentTagCategory,
  fetchDocumentTagCategoryDefaults,
  updateDocumentTagCategory,
  type DocumentTagCategoryCreatePayload,
  type DocumentTagCategoryDetail,
  type DocumentTagCategoryUpdatePayload,
} from '@/resources/documentTagCategories'

/*
 * The tag category form, for both creating and editing, and with NO router --
 * ContactTagFormView's twin: a name and a colour. The colour is the one every
 * tag of the category is painted with. The tags themselves are edited from
 * the categories tree, not here.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [category: DocumentTagCategoryDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/** A palette index, clamped to the backend's check constraint: see ContactTagFormView. */
function colorIndex(value: FieldValue): number {
  const parsed = toNumberOrNull(value) ?? 0
  return Math.min(Math.max(0, Math.trunc(parsed)), MAX_COLOR_INDEX)
}

function createPayload(values: FormData): DocumentTagCategoryCreatePayload {
  return {
    name: text(values.name) ?? '',
    color: colorIndex(values.color),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): DocumentTagCategoryUpdatePayload {
  const body: DocumentTagCategoryUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('color' in changed) body.color = colorIndex(changed.color)
  return body
}

const form = useResourceForm<DocumentTagCategoryDetail>({
  id: () => props.id,
  // `null` is not a legal colour: a new category opens on the first swatch.
  defaults: { name: null, color: 0 },
  toForm: (category) => ({ name: category.name, color: category.color }),
  fetchOne: fetchDocumentTagCategory,
  fetchDefaults: fetchDocumentTagCategoryDefaults,
  create: (values) => createDocumentTagCategory(createPayload(values)),
  update: (id, changed) => updateDocumentTagCategory(id, updatePayload(changed)),
  remove: deleteDocumentTagCategory,
  notFoundMessage: 'This category no longer exists.',
  onSaved: (category, mode) => emit('saved', category, mode),
  onDeleted: () => emit('deleted'),
})

const { isNew, data } = form

const title = computed(() =>
  isNew.value ? 'New category' : (text(data.value?.name ?? null) ?? 'Category'),
)
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="2"
    delete-permission="totem.documenttagcategory.delete"
    delete-header="Delete this category?"
    :delete-message="`“${title}” will be deleted. A category still holding tags cannot be.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <!-- Unique across the instance: a duplicate comes back as a field error. -->
    <Field
      name="name"
      widget="string"
      label="Name"
      required
      :options="{ maxLength: 255, placeholder: 'Status' }"
      help="Must be unique."
    />

    <!-- An index into the shared palette: `max` mirrors the backend's
         check constraint. -->
    <Field
      name="color"
      widget="color"
      label="Colour"
      required
      :options="{ max: MAX_COLOR_INDEX }"
      help="Every tag of the category is painted with it."
    />
  </FormView>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createDocumentTag,
  fetchDocumentTag,
  updateDocumentTag,
  type DocumentTagDetail,
  type DocumentTagUpdatePayload,
} from '@/resources/documentTags'

/*
 * One document tag, created or edited inside the Dialog of DocumentTagListView
 * -- so `mode="dialog"`, and no route of its own.
 *
 * The CATEGORY is not a field: the tag is created from its category's list,
 * which passes it as `categoryId`, and moving a tag to another category is not
 * offered (the name is unique per category, and the colour would change under
 * the documents carrying it). The order is not a field either: it is the
 * list's drag handle.
 */
const props = defineProps<{
  /** `null` creates. */
  id: string | null
  /** The category a NEW tag joins. */
  categoryId: string
}>()

const emit = defineEmits<{
  saved: [tag: DocumentTagDetail, mode: 'create' | 'edit']
  cancel: []
  /** The heading for the Dialog. */
  title: [title: string]
}>()

function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): DocumentTagUpdatePayload {
  const body: DocumentTagUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  return body
}

const form = useResourceForm<DocumentTagDetail>({
  id: () => props.id,
  defaults: { name: null },
  toForm: (tag) => ({ name: tag.name }),
  fetchOne: fetchDocumentTag,
  create: (values) =>
    createDocumentTag({ name: text(values.name) ?? '', category: props.categoryId }),
  update: (id, changed) => updateDocumentTag(id, updatePayload(changed)),
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
    mode="dialog"
    :skeleton="1"
    create-label="Add"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <!-- Unique within the category: a duplicate comes back as a field error. -->
    <Field
      name="name"
      widget="string"
      label="Name"
      required
      :options="{ maxLength: 255, placeholder: 'Paid' }"
      help="Unique within its category."
    />
  </FormView>
</template>

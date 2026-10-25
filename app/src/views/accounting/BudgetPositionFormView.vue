<script setup lang="ts">
import { computed, ref } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  searchApplicableCategories,
  type AccountCategoryRef,
} from '@/resources/accountCategories'
import {
  createBudgetPosition,
  deleteBudgetPosition,
  fetchBudgetPosition,
  updateBudgetPosition,
  type BudgetPositionCreatePayload,
  type BudgetPositionDetail,
  type BudgetPositionUpdatePayload,
} from '@/resources/budgetPositions'

/*
 * The position form -- a category of a budget -- for both adding and editing.
 *
 * Built to sit in a Dialog, which is why its <FormView> is `mode="dialog"`:
 * the Dialog is the frame, and a card inside a modal is a box in a box. Like every view it
 * has no router; its host closes the Dialog on `saved`, `cancel` and
 * `deleted`, and shows `title` as the header.
 *
 * The category dropdown is narrowed to the budget's account (`applicable_to`):
 * the backend refuses any other category, and the unique constraint refuses a
 * category the budget already has -- that one is left to the backend, whose
 * field error <Form> shows in place.
 */
const props = defineProps<{
  /** `null` adds. */
  id: string | null
  budgetId: string
  /** The budget's account: it decides which categories are allowed. */
  accountId: string
}>()

const emit = defineEmits<{
  saved: [position: BudgetPositionDetail, mode: 'create' | 'edit']
  cancel: []
  deleted: []
  /** The heading for whoever frames this form -- here, the Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

const searchCategories = computed(() => searchApplicableCategories(props.accountId))

/** The category of the loaded record, nested: the draft only carries its id. */
const category = ref<AccountCategoryRef | null>(null)

function createPayload(values: FormData): BudgetPositionCreatePayload {
  return {
    category: text(values.category) ?? '',
    sequence: toNumberOrNull(values.sequence) ?? 10,
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): BudgetPositionUpdatePayload {
  const body: BudgetPositionUpdatePayload = {}
  if ('category' in changed) body.category = text(changed.category) ?? ''
  if ('sequence' in changed) body.sequence = toNumberOrNull(changed.sequence) ?? 10
  return body
}

const form = useResourceForm<BudgetPositionDetail>({
  id: () => props.id,
  // The model's own default sequence, so a create never has to send null.
  defaults: { category: null, sequence: 10 },
  toForm: (position) => ({
    category: position.category?.id ?? null,
    sequence: position.sequence,
  }),
  fetchOne: (id, signal) => fetchBudgetPosition(props.budgetId, id, signal),
  onLoaded: (position) => {
    category.value = position?.category ?? null
  },
  create: (values) => createBudgetPosition(props.budgetId, createPayload(values)),
  update: (id, changed) => updateBudgetPosition(props.budgetId, id, updatePayload(changed)),
  notFoundMessage: 'This category is no longer part of the budget.',
  onSaved: (position, mode) => emit('saved', position, mode),
  remove: (id) => deleteBudgetPosition(props.budgetId, id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This category could not be removed.',
})

const { isNew } = form

const title = computed(() => {
  if (isNew.value) return 'Add a category'
  return text(category.value?.name ?? null) ?? 'Category'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    mode="dialog"
    :skeleton="2"
    create-label="Add"
    delete-permission="totem.budget.delete"
    delete-header="Remove this category?"
    :delete-message="`“${title}” will be removed from the budget, with its lines.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <Field
      name="category"
      widget="many2one"
      label="Category"
      required
      :options="{
        fetch: searchCategories,
        record: category,
        permission: 'totem.accountcategory.read',
      }"
      help="A general category, or one of the budget's account."
    />

    <Field
      name="sequence"
      widget="integer"
      label="Sequence"
      required
      help="Ordering among the categories of the budget."
    />
  </FormView>
</template>

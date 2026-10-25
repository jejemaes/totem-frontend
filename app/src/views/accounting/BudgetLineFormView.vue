<script setup lang="ts">
import { computed } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createBudgetLine,
  deleteBudgetLine,
  fetchBudgetLine,
  updateBudgetLine,
  type BudgetLineCreatePayload,
  type BudgetLineDetail,
  type BudgetLineUpdatePayload,
} from '@/resources/budgetLines'

/*
 * The budget line form, for both adding and editing, built to sit in a Dialog
 * (`mode="dialog"`, no router: see BudgetPositionFormView).
 *
 * The position is a PROP, not a field: a line is added from inside the
 * position it belongs to, so there is nothing to pick. It goes out with the
 * create and never with an update -- the API would let a line move to another
 * position, but no screen offers that yet, and echoing the key would be the
 * kind of untouched-field write the PATCH asymmetry warns about.
 */
const props = defineProps<{
  /** `null` adds. */
  id: string | null
  budgetId: string
  positionId: string
}>()

const emit = defineEmits<{
  saved: [line: BudgetLineDetail, mode: 'create' | 'edit']
  cancel: []
  deleted: []
  /** The heading for whoever frames this form -- here, the Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function createPayload(values: FormData): BudgetLineCreatePayload {
  return {
    name: text(values.name) ?? '',
    position: props.positionId,
    // `required` keeps an empty amount from reaching here.
    planned_amount: toNumberOrNull(values.planned_amount) ?? 0,
    sequence: toNumberOrNull(values.sequence) ?? 10,
  }
}

/** Only the keys <Form> reports as edited reach the PATCH, and never `position`. */
function updatePayload(changed: FormData): BudgetLineUpdatePayload {
  const body: BudgetLineUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('planned_amount' in changed) body.planned_amount = toNumberOrNull(changed.planned_amount) ?? 0
  if ('sequence' in changed) body.sequence = toNumberOrNull(changed.sequence) ?? 10
  return body
}

const form = useResourceForm<BudgetLineDetail>({
  id: () => props.id,
  defaults: { name: null, planned_amount: null, sequence: 10 },
  // The amount arrives as a decimal string; FloatField binds a number.
  toForm: (line) => ({
    name: line.name,
    planned_amount: toNumberOrNull(line.planned_amount),
    sequence: line.sequence,
  }),
  fetchOne: (id, signal) => fetchBudgetLine(props.budgetId, id, signal),
  create: (values) => createBudgetLine(props.budgetId, createPayload(values)),
  update: (id, changed) => updateBudgetLine(props.budgetId, id, updatePayload(changed)),
  notFoundMessage: 'This line no longer exists.',
  onSaved: (line, mode) => emit('saved', line, mode),
  remove: (id) => deleteBudgetLine(props.budgetId, id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This line could not be deleted.',
})

const { isNew, data } = form

const title = computed(() =>
  isNew.value ? 'Add a line' : (text(data.value?.name ?? null) ?? 'Line'),
)
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    mode="dialog"
    :skeleton="3"
    create-label="Add"
    delete-permission="totem.budget.delete"
    delete-header="Delete this line?"
    :delete-message="`“${title}” will be removed from the budget.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <Field
      name="name"
      widget="string"
      label="Name"
      required
      :options="{ maxLength: 255, placeholder: 'Rent' }"
    />

    <Field
      name="planned_amount"
      widget="float"
      label="Planned amount"
      required
      :options="{ maxFractionDigits: 2 }"
    />

    <Field
      name="sequence"
      widget="integer"
      label="Sequence"
      required
      help="Ordering among the lines of the category."
    />
  </FormView>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toIsoDate, toNumberOrNull } from '@/components/form/fields/values'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  searchApplicableCategories,
  type AccountCategoryRef,
} from '@/resources/accountCategories'
import {
  createAccountMovement,
  deleteAccountMovement,
  fetchAccountMovement,
  updateAccountMovement,
  type AccountMovementCreatePayload,
  type AccountMovementDetail,
  type AccountMovementUpdatePayload,
} from '@/resources/accountMovements'

/*
 * The movement form, for both creating and editing, and with NO router.
 *
 * The account is a PROP and not a field: a movement belongs to its account for
 * good (the update schema has no `account`), so there is nothing to pick. It
 * goes out with the create and never with an update.
 *
 * The category dropdown is narrowed with `applicable_to`: the backend only
 * accepts a general category or one owned by this very account, so a wider
 * list would offer choices that end in a 422.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
  /** The account the movement is, or will be, booked on. */
  accountId: string
}>()

const emit = defineEmits<{
  saved: [movement: AccountMovementDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Bound to the account through a computed, so a reused component that is
 * handed another account does not keep searching the old one's categories.
 */
const searchCategories = computed(() => searchApplicableCategories(props.accountId))

/**
 * The category of the loaded record, nested. The draft carries its id only,
 * so the label has to come from the record; re-seeded through `onLoaded`, the
 * one hook that fires when the route param changes under a reused component.
 */
const category = ref<AccountCategoryRef | null>(null)

function createPayload(values: FormData): AccountMovementCreatePayload {
  return {
    account: props.accountId,
    // `required` keeps an empty amount from reaching here; 0 is refused by the
    // backend's check constraint and comes back as a field error.
    amount: toNumberOrNull(values.amount) ?? 0,
    name: text(values.name) ?? '',
    date: text(values.date) ?? '',
    description: text(values.description),
    reference: text(values.reference),
    category: text(values.category),
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH, and never `account`:
 * the update schema does not take it.
 */
function updatePayload(changed: FormData): AccountMovementUpdatePayload {
  const body: AccountMovementUpdatePayload = {}
  if ('amount' in changed) body.amount = toNumberOrNull(changed.amount) ?? 0
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('date' in changed) body.date = text(changed.date) ?? ''
  if ('description' in changed) body.description = text(changed.description)
  if ('reference' in changed) body.reference = text(changed.reference)
  if ('category' in changed) body.category = text(changed.category)
  return body
}

const form = useResourceForm<AccountMovementDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // Today, through toIsoDate: `toISOString().slice(0, 10)` would hand back
  // YESTERDAY to anyone east of Greenwich before their local 1 or 2 a.m.
  defaults: {
    name: null,
    date: toIsoDate(new Date()),
    amount: null,
    category: null,
    reference: null,
    description: null,
  },
  // The amount arrives as a decimal string; FloatField binds a number.
  toForm: (movement) => ({
    name: movement.name,
    date: movement.date,
    amount: toNumberOrNull(movement.amount),
    category: movement.category?.id ?? null,
    reference: movement.reference,
    description: movement.description,
  }),
  fetchOne: fetchAccountMovement,
  onLoaded: (movement) => {
    category.value = movement?.category ?? null
  },
  create: (values) => createAccountMovement(createPayload(values)),
  update: (id, changed) => updateAccountMovement(id, updatePayload(changed)),
  notFoundMessage: 'This movement no longer exists.',
  onSaved: (movement, mode) => emit('saved', movement, mode),
  remove: (id) => deleteAccountMovement(id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This movement could not be deleted.',
})

const { isNew, data } = form

const title = computed(() => {
  if (isNew.value) return 'New movement'
  return text(data.value?.name ?? null) ?? 'Movement'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="6"
    delete-permission="totem.accountmovement.delete"
    delete-header="Delete this movement?"
    :delete-message="`“${title}” will be removed, and the account balance with it.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <Field
      name="name"
      widget="string"
      label="Name"
      required
      :options="{ maxLength: 255, placeholder: 'Office rent' }"
    />

    <Field name="date" widget="date" label="Date" required />

    <!-- ONE signed amount: the backend has no direction column, and a
         split control would be a second copy of the sign to keep in
         step. Two decimals, like the DecimalField behind it. -->
    <Field
      name="amount"
      widget="float"
      label="Amount"
      required
      :options="{ maxFractionDigits: 2, placeholder: '-120.00' }"
      help="Negative for an expense, positive for a revenue. Never zero."
    />

    <Field
      name="category"
      widget="many2one"
      label="Category"
      :options="{
        fetch: searchCategories,
        record: category,
        permission: 'totem.accountcategory.read',
      }"
      help="The general categories and this account's own."
    />

    <Field
      name="reference"
      widget="string"
      label="Reference"
      :options="{ maxLength: 100, placeholder: 'INV-2026-0042' }"
      help="An invoice or order number."
    />

    <Field name="description" widget="text" label="Description" />
  </FormView>
</template>

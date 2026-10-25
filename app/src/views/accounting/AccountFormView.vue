<script setup lang="ts">
import { computed } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createAccount,
  deleteAccount,
  fetchAccount,
  updateAccount,
  type AccountCreatePayload,
  type AccountDetail,
  type AccountUpdatePayload,
} from '@/resources/accounts'

/*
 * The account form, for both creating and editing, and with NO router: the
 * record comes in as the `id` prop and every way out is an event.
 *
 * The three totals are shown read-only on an existing account. They sit in the
 * draft like any field, but a readonly field can never be edited, so they
 * never reach `changed` -- and the payload builders do not name them anyway:
 * neither schema accepts them.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [account: AccountDetail, mode: 'create' | 'edit']
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
 * The code, upper-cased on the way out.
 *
 * The backend's pattern is `^[A-Z0-9_-]{1,50}$` and it REFUSES lower case
 * rather than folding it, so `bank` would come back as a 422 the user then
 * has to fix by retyping. Folding here is lossless -- no two valid codes differ
 * by case alone -- and anything else invalid is still left to the backend to
 * name.
 */
function code(value: FieldValue): string {
  return (text(value) ?? '').trim().toUpperCase()
}

function createPayload(values: FormData): AccountCreatePayload {
  return {
    code: code(values.code),
    name: text(values.name) ?? '',
    description: text(values.description),
    active: values.active === true,
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): AccountUpdatePayload {
  const body: AccountUpdatePayload = {}
  if ('code' in changed) body.code = code(changed.code)
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('description' in changed) body.description = text(changed.description)
  if ('active' in changed) body.active = changed.active === true
  return body
}

const form = useResourceForm<AccountDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // `active` starts true, the model's own default: a new account is meant to
  // be used.
  defaults: { code: null, name: null, description: null, active: true },
  // The totals arrive as decimal strings; FloatField binds a number.
  toForm: (account) => ({
    code: account.code,
    name: account.name,
    description: account.description,
    active: account.active,
    total_debit: toNumberOrNull(account.total_debit),
    total_credit: toNumberOrNull(account.total_credit),
    balance: toNumberOrNull(account.balance),
  }),
  fetchOne: fetchAccount,
  create: (values) => createAccount(createPayload(values)),
  update: (id, changed) => updateAccount(id, updatePayload(changed)),
  notFoundMessage: 'This account no longer exists.',
  onSaved: (account, mode) => emit('saved', account, mode),
  // An account holding movements cannot be removed (`on_delete=PROTECT`). The
  // refusal is shown as-is: the backend names the reason better.
  remove: (id) => deleteAccount(id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This account could not be deleted.',
})

const { isNew, data } = form

const title = computed(() => {
  if (isNew.value) return 'New account'
  const name = text(data.value?.name ?? null)
  const accountCode = text(data.value?.code ?? null)
  if (accountCode && name) return `${accountCode} · ${name}`
  return name ?? 'Account'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="4"
    delete-permission="totem.account.delete"
    delete-header="Delete this account?"
    :delete-message="`“${title}” and its own categories will be removed.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <Field
      name="code"
      widget="string"
      label="Code"
      required
      :options="{ maxLength: 50, placeholder: 'BANK-MAIN' }"
      help="Upper case letters, digits, '_' and '-' only."
    />

    <!-- Unique: a duplicate comes back as a field error, shown in place. -->
    <Field
      name="name"
      widget="string"
      label="Name"
      required
      :options="{ maxLength: 255, placeholder: 'Main bank account' }"
    />

    <Field name="description" widget="text" label="Description" />

    <Field
      name="active"
      widget="boolean"
      label="Active"
      required
      help="An archived account keeps its movements."
    />

    <!-- Computed by the backend from the movements: shown, never sent. -->
    <template v-if="!isNew">
      <Field
        name="total_debit"
        widget="float"
        label="Total debit"
        readonly
        :options="{ maxFractionDigits: 2 }"
        help="The sum of the expenses."
      />
      <Field
        name="total_credit"
        widget="float"
        label="Total credit"
        readonly
        :options="{ maxFractionDigits: 2 }"
        help="The sum of the revenues."
      />
      <Field
        name="balance"
        widget="float"
        label="Balance"
        readonly
        :options="{ maxFractionDigits: 2 }"
        help="The sum of every movement."
      />
    </template>
  </FormView>
</template>

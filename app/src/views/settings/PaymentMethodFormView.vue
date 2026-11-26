<script setup lang="ts">
import { computed } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import FormColumns from '@/components/form/FormColumns.vue'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createPaymentMethod,
  deletePaymentMethod,
  fetchPaymentMethod,
  fetchPaymentMethodDefaults,
  PAYMENT_METHOD_TYPE_CHOICES,
  paymentMethodIbanPayload,
  updatePaymentMethod,
  type PaymentMethodCreatePayload,
  type PaymentMethodDetail,
  type PaymentMethodType,
  type PaymentMethodUpdatePayload,
} from '@/resources/paymentMethods'

/*
 * The payment method form, for both creating and editing, and with NO router:
 * the record comes in as the `id` prop and every way out is an event.
 *
 * No `sequence` field: the order is set by dragging the rows of the list, and
 * a new method takes the backend's default.
 *
 * The IBAN is mounted only on a bank method -- the backend requires it there
 * and refuses it anywhere else. Hidden, its value stays in the draft, so
 * switching back to "Bank" finds it again; `paymentMethodIbanPayload` sends
 * it as `null` once the type is not bank, which is what resets it.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [method: PaymentMethodDetail, mode: 'create' | 'edit']
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
 * The code, upper-cased on the way out -- as on an account, and for the same
 * reason: the backend's pattern REFUSES lower case rather than folding it.
 */
function code(value: FieldValue): string {
  return (text(value) ?? '').trim().toUpperCase()
}

/**
 * `required` on the field keeps an empty type from being sent; anything else
 * is left to the backend to refuse, with its own message.
 */
function type(value: FieldValue): PaymentMethodType {
  return text(value) as PaymentMethodType
}

function createPayload(values: FormData): PaymentMethodCreatePayload {
  return {
    code: code(values.code),
    name: text(values.name) ?? '',
    type: type(values.type),
    active: values.active === true,
    ...paymentMethodIbanPayload(values),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): PaymentMethodUpdatePayload {
  const body: PaymentMethodUpdatePayload = {}
  if ('code' in changed) body.code = code(changed.code)
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('type' in changed) body.type = type(changed.type)
  if ('active' in changed) body.active = changed.active === true
  return { ...body, ...paymentMethodIbanPayload(changed) }
}

const form = useResourceForm<PaymentMethodDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // The fallback when the default-values request fails; `active` mirrors the
  // model's own default.
  defaults: { code: null, name: null, type: null, active: true, iban: null },
  toForm: (method) => ({
    code: method.code,
    name: method.name,
    type: method.type,
    active: method.active,
    iban: method.iban,
  }),
  fetchOne: fetchPaymentMethod,
  fetchDefaults: fetchPaymentMethodDefaults,
  create: (values) => createPaymentMethod(createPayload(values)),
  update: (id, changed) => updatePaymentMethod(id, updatePayload(changed)),
  notFoundMessage: 'This payment method no longer exists.',
  onSaved: (method, mode) => emit('saved', method, mode),
  // A method used by a payment cannot be removed (`on_delete=PROTECT`). The
  // refusal is shown as-is: the backend names the reason better.
  remove: (id) => deletePaymentMethod(id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This payment method could not be deleted.',
})

const { isNew, data } = form

const title = computed(() => {
  if (isNew.value) return 'New payment method'
  const name = text(data.value?.name ?? null)
  const methodCode = text(data.value?.code ?? null)
  if (methodCode && name) return `${methodCode} · ${name}`
  return name ?? 'Payment method'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="3"
    delete-permission="totem.paymentmethod.delete"
    delete-header="Delete this payment method?"
    :delete-message="`“${title}” will be deleted.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <template #default="{ draft }">
      <FormColumns>
        <!-- Unique: a duplicate comes back as a field error, shown in place. -->
        <Field
          name="code"
          widget="string"
          label="Code"
          required
          :options="{ maxLength: 50, placeholder: 'BANK-TRANSFER' }"
          help="Upper case letters, digits, '_' and '-' only."
        />

        <Field
          name="name"
          widget="string"
          label="Name"
          required
          :options="{ maxLength: 255, placeholder: 'Bank transfer' }"
        />

        <Field
          name="type"
          widget="selection"
          label="Type"
          required
          :options="{ choices: [...PAYMENT_METHOD_TYPE_CHOICES] }"
        />

        <Field
          name="active"
          widget="boolean"
          label="Active"
          required
          help="An archived method keeps its payments, but is no longer offered."
        />

        <!-- Spaces and lower case are fine: the backend stores the compact form,
             and says on this field when the check digits are wrong. -->
        <Field
          v-if="draft.type === 'bank'"
          name="iban"
          widget="string"
          label="IBAN"
          required
          :options="{ maxLength: 42, placeholder: 'FR76 3000 6000 0112 3456 7890 189' }"
          help="The bank account the payments of this method go through."
        />
      </FormColumns>
    </template>
  </FormView>
</template>

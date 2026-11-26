<script setup lang="ts">
import { computed } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toIsoDate, toNumberOrNull } from '@/components/form/fields/values'
import FormColumns from '@/components/form/FormColumns.vue'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import type { Amount } from '@/resources/accounts'
import type { CurrencyCode } from '@/resources/currencies'
import {
  registerInvoicePayment,
  updateInvoicePayment,
  type InvoicePaymentCreatePayload,
  type InvoicePaymentDetail,
  type InvoicePaymentUpdatePayload,
} from '@/resources/invoices'
import { displayPaymentMethod, searchPaymentMethods } from '@/resources/paymentMethods'

/*
 * The form of ONE payment of an invoice, registering or editing it, built to
 * sit in a Dialog (`mode="dialog"`, no router: see BudgetLineFormView).
 *
 * The payment comes in WHOLE as a prop rather than as an id to fetch: the
 * invoice's route serves its payments as a list and no detail, and the
 * collection's own detail (`/payment/payments/{id}/`) sits behind
 * `totem.payment.read`, a scope a user paying invoices need not hold. The list
 * just loaded it, so `fetchOne` hands it back.
 *
 * No direction and no currency: the backend takes both from the invoice
 * (outgoing, in its currency) and refuses anything else. The currency still
 * rides in the draft, unseen, for the amount's symbol (`currencyField`). No
 * state and no contact either: a payment of an invoice is registered DONE, to
 * its supplier, and the route accepts neither.
 *
 * No Delete button: the route's DELETE cancels the payment rather than
 * removing it, and that is the list row's action (InvoicePaymentListView).
 */
const props = defineProps<{
  invoiceId: string
  /** `null` registers a new one. */
  payment: InvoicePaymentDetail | null
  /** The invoice's: what the amount is written in. */
  currencyCode: CurrencyCode | null
  /** What is still due on the invoice: what a new payment proposes to pay. */
  residual: Amount | null
}>()

const emit = defineEmits<{
  saved: [payment: InvoicePaymentDetail, mode: 'create' | 'edit']
  cancel: []
  /** The heading for whoever frames this form -- here, the Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts; `''` is no value. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Built key by key, never by copying the draft. */
function createPayload(values: FormData): InvoicePaymentCreatePayload {
  return {
    date: text(values.date) ?? '',
    // `required` keeps an empty amount from reaching here; 0 is the backend's
    // to refuse.
    amount: toNumberOrNull(values.amount) ?? 0,
    payment_method: text(values.payment_method) ?? '',
    reference: text(values.reference),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): InvoicePaymentUpdatePayload {
  const body: InvoicePaymentUpdatePayload = {}
  if ('date' in changed) body.date = text(changed.date) ?? ''
  if ('amount' in changed) body.amount = toNumberOrNull(changed.amount) ?? 0
  if ('payment_method' in changed) body.payment_method = text(changed.payment_method) ?? ''
  if ('reference' in changed) body.reference = text(changed.reference)
  return body
}

const form = useResourceForm<InvoicePaymentDetail>({
  id: () => props.payment?.id ?? null,
  // No default-values route under an invoice: a new payment is dated today
  // and pays what is still due.
  defaults: {
    date: toIsoDate(new Date()),
    amount: toNumberOrNull(props.residual),
    payment_method: null,
    reference: null,
    currency_code: props.currencyCode,
  },
  // The amount arrives as a decimal string; the monetary field binds a number.
  toForm: (payment) => ({
    date: payment.date,
    amount: toNumberOrNull(payment.amount),
    payment_method: payment.payment_method?.id ?? null,
    reference: payment.reference,
    currency_code: payment.currency_code,
  }),
  // The list's own record: see the header. Never reached on a register.
  fetchOne: () =>
    props.payment
      ? Promise.resolve(props.payment)
      : Promise.reject(new Error('No payment to edit.')),
  create: (values) => registerInvoicePayment(props.invoiceId, createPayload(values)),
  update: (id, changed) => updateInvoicePayment(props.invoiceId, id, updatePayload(changed)),
  notFoundMessage: 'This payment no longer exists.',
  onSaved: (payment, mode) => emit('saved', payment, mode),
})

const { isNew } = form

/** The nested method, labelling the many2one before any search. */
const method = computed(() => props.payment?.payment_method ?? null)

const title = computed(() => (isNew.value ? 'Register a payment' : 'Payment'))
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    mode="dialog"
    :skeleton="4"
    create-label="Register"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <FormColumns>
      <Field name="date" widget="date" label="Date" required />

      <!-- No more than what is due: the backend says so on this field. -->
      <Field
        name="amount"
        widget="monetary"
        label="Amount"
        required
        :options="{ currencyField: 'currency_code' }"
      />

      <Field
        name="payment_method"
        widget="many2one"
        label="Payment method"
        required
        :options="{
          fetch: searchPaymentMethods,
          record: method,
          relationDisplay: displayPaymentMethod,
          permission: 'totem.paymentmethod.read',
        }"
      />

      <Field name="reference" widget="string" label="Reference" :options="{ maxLength: 100 }" />
    </FormColumns>
  </FormView>
</template>

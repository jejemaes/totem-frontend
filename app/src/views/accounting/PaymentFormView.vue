<script setup lang="ts">
import { computed, ref } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import FieldGroup from '@/components/form/FieldGroup.vue'
import FormColumns from '@/components/form/FormColumns.vue'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { displayContact, searchContacts, type ContactRef } from '@/resources/contacts'
import { CURRENCY_CODE_CHOICES, type CurrencyCode } from '@/resources/currencies'
import { displayInvoice, searchInvoices } from '@/resources/invoices'
import {
  displayPaymentMethod,
  searchPaymentMethods,
  type PaymentMethodRef,
} from '@/resources/paymentMethods'
import {
  createPayment,
  deletePayment,
  fetchPayment,
  fetchPaymentDefaults,
  isPaymentDeletable,
  PAYMENT_DIRECTION_CHOICES,
  PAYMENT_STATE_CHOICES,
  PAYMENT_TARGET_TYPE_CHOICES,
  paymentTargetPayload,
  updatePayment,
  type PaymentAccountMovementRef,
  type PaymentCreatePayload,
  type PaymentDetail,
  type PaymentDirection,
  type PaymentInvoiceRef,
  type PaymentState,
  type PaymentUpdatePayload,
} from '@/resources/payments'

/*
 * The payment form, for both creating and editing, and with NO router: the
 * record comes in as the `id` prop and every way out is an event.
 *
 * The collection's own form, behind `totem.payment.*`: every key, any state,
 * and a payment settling no document -- unlike InvoicePaymentFormView, whose
 * route forces the state, the contact, the direction and the currency. A
 * payment of an invoice written here still obeys the invoice; its refusals
 * (direction, currency, more than due) come back on the field at fault.
 *
 * The invoice field is mounted only while "Settles" says invoice, rather than
 * made readonly: a many2one reads `readonly` once, at mount. Its value stays
 * in the draft meanwhile, and `paymentTargetPayload` clears it on the way out
 * when the target is none.
 *
 * Delete only on a draft or a cancelled payment, as the backend allows: a done
 * payment booked a movement, and is cancelled first.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [payment: PaymentDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts; `''` is no value. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** `required` keeps an empty amount from reaching here; 0 is the backend's to refuse. */
function amount(value: FieldValue): number {
  return toNumberOrNull(value) ?? 0
}

/** Built key by key, never by copying the draft. */
function createPayload(values: FormData): PaymentCreatePayload {
  return {
    date: text(values.date) ?? '',
    amount: amount(values.amount),
    currency_code: text(values.currency_code) as CurrencyCode | null,
    direction: text(values.direction) as PaymentDirection | null,
    state: text(values.state) as PaymentState | null,
    payment_method: text(values.payment_method) ?? '',
    contact: text(values.contact),
    reference: text(values.reference),
    ...paymentTargetPayload(values),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): PaymentUpdatePayload {
  const body: PaymentUpdatePayload = {}
  if ('date' in changed) body.date = text(changed.date) ?? ''
  if ('amount' in changed) body.amount = amount(changed.amount)
  if ('currency_code' in changed) {
    body.currency_code = text(changed.currency_code) as CurrencyCode | null
  }
  if ('direction' in changed) body.direction = text(changed.direction) as PaymentDirection | null
  if ('state' in changed) body.state = text(changed.state) as PaymentState | null
  if ('payment_method' in changed) body.payment_method = text(changed.payment_method) ?? ''
  if ('contact' in changed) body.contact = text(changed.contact)
  if ('reference' in changed) body.reference = text(changed.reference)
  return { ...body, ...paymentTargetPayload(changed) }
}

/** The nested relations, labelling the many2ones: see ContactFormView. */
const method = ref<PaymentMethodRef | null>(null)
const contact = ref<ContactRef | null>(null)
const invoice = ref<PaymentInvoiceRef | null>(null)
const movement = ref<PaymentAccountMovementRef | null>(null)

const form = useResourceForm<PaymentDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // The fallback when the default-values request fails: the model's own
  // defaults. The read-only keys too -- <Field readonly>s, never in `changed`.
  defaults: {
    date: null,
    amount: null,
    currency_code: 'EUR',
    direction: null,
    state: 'draft',
    payment_method: null,
    contact: null,
    reference: null,
    target_type: null,
    invoice: null,
    account_movement: null,
    done_date: null,
  },
  // The amount arrives as a decimal string; the monetary field binds a number.
  toForm: (payment) => ({
    date: payment.date,
    amount: toNumberOrNull(payment.amount),
    currency_code: payment.currency_code,
    direction: payment.direction,
    state: payment.state,
    payment_method: payment.payment_method?.id ?? null,
    contact: payment.contact?.id ?? null,
    reference: payment.reference,
    target_type: payment.target_type,
    invoice: payment.invoice?.id ?? null,
    account_movement: payment.account_movement?.id ?? null,
    done_date: payment.done_date,
  }),
  fetchOne: fetchPayment,
  fetchDefaults: fetchPaymentDefaults,
  onLoaded: (loaded) => {
    method.value = loaded?.payment_method ?? null
    contact.value = loaded?.contact ?? null
    invoice.value = loaded?.invoice ?? null
    movement.value = loaded?.account_movement ?? null
  },
  create: (values) => createPayment(createPayload(values)),
  update: (id, changed) => updatePayment(id, updatePayload(changed)),
  notFoundMessage: 'This payment no longer exists.',
  onSaved: (payment, mode) => emit('saved', payment, mode),
  // Offered on a deletable state only (see the template); a refusal raced in
  // by another tab is still shown as the backend words it.
  remove: (id) => deletePayment(id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This payment could not be deleted.',
})

const { isNew, data, record } = form

/**
 * The STORED state, not the draft's: picking "Cancelled" without saving does
 * not make the payment deletable yet.
 */
const deletable = computed(() => isPaymentDeletable(record.value?.state))

const title = computed(() => {
  if (isNew.value) return 'New payment'
  const reference = text(data.value?.reference ?? null)
  return reference ? `Payment ${reference}` : 'Payment'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="6"
    :delete-permission="deletable ? 'totem.payment.delete' : undefined"
    delete-header="Delete this payment?"
    :delete-message="`“${title}” will be deleted.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <template #default="{ draft }">
      <FormColumns>
        <FieldGroup>
          <Field name="date" widget="date" label="Date" required />

          <Field
            name="amount"
            widget="monetary"
            label="Amount"
            required
            help="Always positive: the direction says which way the money goes."
            :options="{ currencyField: 'currency_code' }"
          />

          <Field
            name="currency_code"
            widget="selection"
            label="Currency"
            required
            :options="{ choices: CURRENCY_CODE_CHOICES }"
          />

          <Field
            name="direction"
            widget="selection"
            label="Direction"
            required
            :options="{ choices: [...PAYMENT_DIRECTION_CHOICES] }"
          />
        </FieldGroup>

        <FieldGroup>
          <Field
            name="state"
            widget="selection"
            label="State"
            required
            help="Only a done payment of a document books an account movement."
            :options="{ choices: [...PAYMENT_STATE_CHOICES] }"
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

          <Field
            name="contact"
            widget="many2one"
            label="Contact"
            help="Who is paid, or who pays."
            :options="{
              fetch: searchContacts,
              record: contact,
              relationDisplay: displayContact,
              permission: 'totem.contact.read',
            }"
          />

          <Field name="reference" widget="string" label="Reference" :options="{ maxLength: 100 }" />
        </FieldGroup>
      </FormColumns>

      <FormColumns>
        <Field
          name="target_type"
          widget="selection"
          label="Settles"
          help="The kind of document this payment settles; empty for none."
          :options="{ choices: [...PAYMENT_TARGET_TYPE_CHOICES], placeholder: 'No document' }"
        />

        <!-- An invoice is paid outgoing, in its currency, for no more than what
             is due: the backend says so on the field at fault. -->
        <Field
          v-if="draft.target_type === 'invoice'"
          name="invoice"
          widget="many2one"
          label="Invoice"
          required
          :options="{
            fetch: searchInvoices,
            record: invoice,
            relationDisplay: displayInvoice,
            permission: 'totem.invoice.read',
          }"
        />
      </FormColumns>

      <!-- What the backend derived: never edited, never sent. -->
      <FormColumns v-if="!isNew">
        <Field
          name="account_movement"
          widget="many2one"
          label="Booked movement"
          readonly
          :options="{ record: movement }"
        />

        <Field name="done_date" widget="datetime" label="Done on" readonly />
      </FormColumns>
    </template>
  </FormView>
</template>

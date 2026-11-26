<script setup lang="ts">
/*
 * The payments of ONE invoice, under its form: a table, a "Register payment"
 * button, and the payment form in a Dialog -- the BudgetLineListView pattern,
 * remounted per open through `dialogKey`.
 *
 * Over the invoice's own route (`/{id}/payments/`), which answers EVERY
 * payment as a bare array: `fetchPage` wraps it as the one page <ListView>
 * expects, with no paginator and no header sort -- the backend sends them
 * latest first, and an invoice has a handful.
 *
 * The route lists the DONE payments only, so there is no state column: every
 * row is paid. Its DELETE CANCELS a payment -- it stays, `cancelled`, and
 * leaves this list -- hence a cancel button with a confirmation of its own
 * rather than DeleteButton, whose "Delete" / "Cancel" buttons would read
 * backwards here.
 *
 * Writing a payment is UPDATING the invoice, server-side, so the edit and
 * cancel buttons and the Register button need `totem.invoice.update`, not a
 * `totem.payment.*` scope. Every write also changes the invoice's paid
 * amounts: `changed` tells the form framing this list to refresh them.
 *
 * `disabled` greys every write while the invoice form holds unsaved edits:
 * refreshing the invoice after a payment would discard them, as a record
 * action's reload would.
 */
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import type { Page } from '@/api/list'
import { can } from '@/auth/permissions'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import type { Amount } from '@/resources/accounts'
import type { CurrencyCode } from '@/resources/currencies'
import {
  cancelInvoicePayment,
  listInvoicePayments,
  type InvoicePaymentDetail,
} from '@/resources/invoices'
import { displayPaymentMethod } from '@/resources/paymentMethods'

import InvoicePaymentFormView from './InvoicePaymentFormView.vue'

const props = defineProps<{
  invoiceId: string
  /** Handed to a new payment: see InvoicePaymentFormView. */
  currencyCode: CurrencyCode | null
  residual: Amount | null
  /** The invoice form is dirty: no write until it is saved. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** A payment was registered, edited or cancelled: the invoice's totals moved. */
  changed: []
}>()

/** A computed, not a bare `can()` call: see ContactListView. */
const canWrite = computed(() => can('totem.invoice.update'))

/** The whole list, as the one page ListView expects. */
async function fetchPage(_query: unknown, signal: AbortSignal): Promise<Page<InvoicePaymentDetail>> {
  const results = await listInvoicePayments(props.invoiceId, signal)
  return { count: results.length, next: null, previous: null, results }
}

/** A <Field> slot is handed a generic row: the helpers below want a payment. */
function payment(row: ListRow): InvoicePaymentDetail {
  return row as InvoicePaymentDetail
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

/*
 * The Dialog. `dialogKey` changes on every open so a FRESH form is mounted
 * each time: reusing the previous one would open "Register" on the draft of
 * the payment edited before.
 */
const dialogVisible = ref(false)
const dialogKey = ref(0)
const editing = ref<InvoicePaymentDetail | null>(null)
const dialogTitle = ref('')

function openForm(row: InvoicePaymentDetail | null): void {
  editing.value = row
  dialogKey.value += 1
  dialogVisible.value = true
}

/** A save closes the Dialog: its opener decides, and this one is done. */
function onWritten(): void {
  dialogVisible.value = false
  void list.value?.reload()
  emit('changed')
}

const confirm = useConfirm()
const cancelError = ref<string | null>(null)

/** Asks first: a cancelled payment cannot be brought back from this screen. */
function askCancel(row: InvoicePaymentDetail): void {
  confirm.require({
    header: 'Cancel this payment?',
    message: 'It will no longer count as paid, and its amount will be due again.',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Keep it', severity: 'secondary', text: true },
    acceptProps: { label: 'Cancel the payment', severity: 'danger' },
    accept: () => void cancelPayment(row),
  })
}

async function cancelPayment(row: InvoicePaymentDetail): Promise<void> {
  cancelError.value = null
  try {
    await cancelInvoicePayment(props.invoiceId, row.id)
    void list.value?.reload()
    emit('changed')
  } catch (caught) {
    cancelError.value =
      caught instanceof ApiError ? caught.message : 'This payment could not be cancelled.'
  }
}
</script>

<template>
  <div class="invoice-payments">
    <Message v-if="cancelError" severity="error" closable @close="cancelError = null">
      {{ cancelError }}
    </Message>

    <ListView
      ref="list"
      :fetch-page="fetchPage"
      paginator="none"
      size="small"
      empty-text="No payment yet."
    >
      <Field name="date" widget="date" label="Date" :width="14" />

      <Field
        name="payment_method"
        widget="many2one"
        label="Method"
        :options="{ relationDisplay: displayPaymentMethod }"
      />

      <Field name="reference" label="Reference" />

      <Field
        name="amount"
        widget="monetary"
        label="Amount"
        :width="16"
        :options="{ currencyField: 'currency_code' }"
      />

      <template #actions="{ row }">
        <Button
          v-if="canWrite"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Edit"
          :disabled="disabled"
          @click="openForm(payment(row))"
        />
        <Button
          v-if="canWrite"
          icon="pi pi-times-circle"
          text
          rounded
          size="small"
          severity="danger"
          aria-label="Cancel the payment"
          title="Cancel the payment"
          :disabled="disabled"
          @click="askCancel(payment(row))"
        />
      </template>
    </ListView>

    <div v-if="canWrite" class="invoice-payments__footer">
      <Button
        label="Register payment"
        icon="pi pi-plus"
        size="small"
        outlined
        :disabled="disabled"
        @click="openForm(null)"
      />
      <small v-if="disabled" class="invoice-payments__hint">
        Save the invoice first.
      </small>
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="dialogTitle"
      :style="{ width: '36rem' }"
    >
      <InvoicePaymentFormView
        :key="dialogKey"
        :invoice-id="invoiceId"
        :payment="editing"
        :currency-code="currencyCode"
        :residual="residual"
        @saved="onWritten"
        @cancel="dialogVisible = false"
        @title="dialogTitle = $event"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.invoice-payments {
  display: grid;
  gap: 0.5rem;
}

.invoice-payments__footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.invoice-payments__hint {
  color: var(--app-muted);
}
</style>

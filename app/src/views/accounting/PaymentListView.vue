<script setup lang="ts">
/*
 * The payment table, with its filter bar -- and NOTHING that ties it to a
 * route. See ContactTagListView for the contract in full.
 *
 * Read only: no edit, no delete, no `open` event. A payment is registered and
 * changed from the document it settles; this collection only lists them.
 *
 * Every field the backend serialises has a column, most of them OFF by
 * default -- the cog ticks them, and a ticked column reloads the page with its
 * key in `?fields=`.
 */
import Tag from 'primevue/tag'

import type { FilterFields } from '@/components/filters/filters'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import { formatAmount } from '@/resources/accounts'
import { contactDisplayNames, displayContact, searchContacts } from '@/resources/contacts'
import { displayInvoice, invoiceDisplayNames, searchInvoices } from '@/resources/invoices'
import {
  displayPaymentMethod,
  paymentMethodDisplayNames,
  searchPaymentMethods,
} from '@/resources/paymentMethods'
import {
  listPayments,
  PAYMENT_DIRECTION_CHOICES,
  PAYMENT_SORTABLE,
  PAYMENT_STATE_CHOICES,
  PAYMENT_TARGET_TYPE_CHOICES,
  paymentStateSeverity,
  type PaymentFilters,
  type PaymentRow,
} from '@/resources/payments'

const props = withDefaults(
  defineProps<{
    /** Mirror page, sort and filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
    pageSize?: number
  }>(),
  { syncUrl: false, pageSize: 20 },
)

const emit = defineEmits<{
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

/**
 * The filters this screen offers, keyed by the query parameter the API takes.
 *
 * `allowNull` ONLY where the backend's MultiValue allows it (`contact`,
 * `target_type`): on the others, declared `allow_null=False`, a `null` item
 * would be a 422.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the reference.',
  },
  state: {
    type: 'selection',
    widget: 'many2many_tags',
    label: 'State',
    help_text: 'Keep the payments in these states.',
    options: { choices: [...PAYMENT_STATE_CHOICES] },
  },
  // ONE value, unlike its neighbours: the backend's `direction` is not a
  // MultiValue -- and both at once is no filter at all.
  direction: {
    type: 'selection',
    label: 'Direction',
    help_text: 'Keep the money received, or the money paid out.',
    options: { choices: [...PAYMENT_DIRECTION_CHOICES] },
  },
  payment_method: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Payment method',
    help_text: 'Keep the payments made with these methods.',
    options: {
      fetch: searchPaymentMethods,
      resolve: paymentMethodDisplayNames,
      relationDisplay: displayPaymentMethod,
      permission: 'totem.paymentmethod.read',
    },
  },
  contact: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Contact',
    help_text: 'Keep the payments with these counterparties.',
    allowNull: true,
    nullLabel: 'No contact',
    options: {
      fetch: searchContacts,
      resolve: contactDisplayNames,
      relationDisplay: displayContact,
      permission: 'totem.contact.read',
    },
  },
  target_type: {
    type: 'selection',
    widget: 'many2many_tags',
    label: 'Settles',
    help_text: 'Keep the payments settling these kinds of document.',
    allowNull: true,
    nullLabel: 'No document',
    options: { choices: [...PAYMENT_TARGET_TYPE_CHOICES] },
  },
  invoice: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Invoice',
    help_text: 'Keep the payments settling these invoices.',
    options: {
      fetch: searchInvoices,
      resolve: invoiceDisplayNames,
      relationDisplay: displayInvoice,
      permission: 'totem.invoice.read',
    },
  },
  // Calendar days, both INCLUSIVE: the backend compares with gte / lte on a
  // DateField, so "to 16/10" keeps the 16th.
  date_from: {
    type: 'date',
    label: 'From',
    help_text: 'Payments on or after this day.',
  },
  date_to: {
    type: 'date',
    label: 'To',
    help_text: 'Payments on or before this day.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<PaymentFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A <Field> slot is handed a generic row: the helpers below want a payment. */
function payment(row: ListRow): PaymentRow {
  return row as PaymentRow
}

/** The label of a state, the raw value when the backend grew one unknown here. */
function stateLabel(state: unknown): string {
  return PAYMENT_STATE_CHOICES.find((choice) => choice.value === state)?.label ?? String(state)
}

/**
 * The amount, signed by `direction` for display only: the backend stores it
 * positive, and a column of unsigned amounts would hide which way the money
 * went once the Direction column is unticked.
 */
function signedAmount(row: PaymentRow): string {
  const formatted = formatAmount(row.amount)
  return row.direction === 'outgoing' && formatted !== '—' ? `−${formatted}` : formatted
}
</script>

<template>
  <ListView
    :fetch-page="listPayments"
    :filters="filters"
    sort-field="date"
    :sort-order="-1"
    :sortable="PAYMENT_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="payments"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a reference…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-money-bill" />
        <p v-if="filters.search">No payment matches “{{ filters.search }}”.</p>
        <p v-else-if="activeFilters.length">No payment matches these filters.</p>
        <p v-else>No payment yet.</p>
      </div>
    </template>

    <!-- Newest first, the backend's own default. -->
    <Field name="date" widget="date" label="Date" sortable :width="10" />

    <Field name="reference" label="Reference" sortable />

    <Field
      name="contact"
      widget="many2one"
      label="Contact"
      :width="18"
      :options="{ relationDisplay: displayContact }"
    />

    <Field
      name="payment_method"
      widget="many2one"
      label="Method"
      :width="14"
      :options="{ relationDisplay: displayPaymentMethod }"
    />

    <Field
      name="direction"
      widget="selection"
      label="Direction"
      :width="10"
      :default-display="false"
      :options="{ choices: [...PAYMENT_DIRECTION_CHOICES] }"
    />

    <!-- The direction and the currency are read with the amount, whatever
         columns are ticked. -->
    <Field
      name="amount"
      label="Amount"
      :fields="['amount', 'direction', 'currency_code']"
      sortable
      align="end"
      :width="14"
    >
      <template #default="{ row }">
        <div class="amount" :class="{ 'amount--outgoing': payment(row).direction === 'outgoing' }">
          {{ signedAmount(payment(row)) }}
          <span class="amount__currency">{{ payment(row).currency_code }}</span>
        </div>
      </template>
    </Field>

    <Field name="currency_code" label="Currency" :width="8" :default-display="false" />

    <Field name="state" label="State" sortable :width="10">
      <template #default="{ value }">
        <Tag :value="stateLabel(value)" :severity="paymentStateSeverity(value)" />
      </template>
    </Field>

    <Field
      name="target_type"
      widget="selection"
      label="Settles"
      :width="10"
      :default-display="false"
      :options="{ choices: [...PAYMENT_TARGET_TYPE_CHOICES] }"
    />

    <!-- The backend nests the invoice's id alone: the cell shows that id. -->
    <Field
      name="invoice"
      widget="many2one"
      label="Invoice"
      :width="14"
      :default-display="false"
      :options="{ relationDisplay: displayInvoice }"
    />

    <Field
      name="account_movement"
      widget="many2one"
      label="Movement"
      :width="16"
      :default-display="false"
    />

    <Field
      name="done_date"
      widget="datetime"
      label="Done on"
      sortable
      :width="14"
      :default-display="false"
    />

    <Field
      name="create_date"
      widget="datetime"
      label="Created on"
      sortable
      :width="14"
      :default-display="false"
    />

    <Field
      name="update_date"
      widget="datetime"
      label="Updated on"
      :width="14"
      :default-display="false"
    />
  </ListView>
</template>

<style scoped>
.table-empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--app-muted);
}

.table-empty i {
  font-size: 1.5rem;
}

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.amount--outgoing {
  color: var(--p-red-500);
}

.amount__currency {
  color: var(--app-muted);
  font-size: 0.85em;
}
</style>

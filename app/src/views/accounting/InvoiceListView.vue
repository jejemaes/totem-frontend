<script setup lang="ts">
/*
 * The invoice table, with its filter bar -- and NOTHING that ties it to a
 * route: the routed page decides what opening a row means. See
 * ContactTagListView for the contract in full.
 *
 * Every serialised field but the file and the description has a column, the
 * secondary ones OFF by default -- the cog ticks them.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import type { FilterFields } from '@/components/filters/filters'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  accountCategoryDisplayNames,
  searchAccountCategories,
} from '@/resources/accountCategories'
import { accountDisplayNames, displayAccount, searchAccounts } from '@/resources/accounts'
import { contactDisplayNames, displayContact, searchContacts } from '@/resources/contacts'
import {
  deleteInvoice,
  INVOICE_PAYMENT_STATUS_CHOICES,
  INVOICE_SORTABLE,
  invoicePaymentStatusLabel,
  invoicePaymentStatusSeverity,
  listInvoices,
  type InvoiceFilters,
  type InvoiceRow,
} from '@/resources/invoices'

const props = withDefaults(
  defineProps<{
    /** Mirror page, sort and filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
    pageSize?: number
  }>(),
  { syncUrl: false, pageSize: 20 },
)

const emit = defineEmits<{
  /** The edit button of a row: what that means is up to the caller. */
  open: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.invoice.update'))
const canDelete = computed(() => can('totem.invoice.delete'))

/**
 * The filters this screen offers, keyed by the query parameter the API takes.
 * `allowNull` on `category` alone: every other MultiValue of the backend is
 * declared `allow_null=False` -- an invoice always has a supplier and an
 * account, while its category is optional.
 *
 * The category filter offers EVERY category, not `applicable_to` one account
 * as the form does: the list spans all the accounts.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the number, the name or the supplier reference.',
  },
  contact: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Supplier',
    help_text: 'Keep the invoices of these suppliers.',
    options: {
      fetch: searchContacts,
      resolve: contactDisplayNames,
      relationDisplay: displayContact,
      permission: 'totem.contact.read',
    },
  },
  account: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Account',
    help_text: 'Keep the invoices booked on these accounts.',
    options: {
      fetch: searchAccounts,
      resolve: accountDisplayNames,
      relationDisplay: displayAccount,
      permission: 'totem.account.read',
    },
  },
  category: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Category',
    help_text: 'Keep the invoices filed under these categories.',
    allowNull: true,
    nullLabel: 'Uncategorized',
    options: {
      fetch: searchAccountCategories,
      resolve: accountCategoryDisplayNames,
      permission: 'totem.accountcategory.read',
    },
  },
  payment_status: {
    type: 'selection',
    widget: 'many2many_tags',
    label: 'Payment status',
    help_text: 'Keep the invoices in these payment statuses.',
    options: { choices: [...INVOICE_PAYMENT_STATUS_CHOICES] },
  },
  // Calendar days, both INCLUSIVE: the backend compares with gte / lte on a
  // DateField, so "to 16/10" keeps the 16th.
  date_from: {
    type: 'date',
    label: 'From',
    help_text: 'Invoices dated on or after this day.',
  },
  date_to: {
    type: 'date',
    label: 'To',
    help_text: 'Invoices dated on or before this day.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<InvoiceFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A <Field> slot is handed a generic row: remove() wants an invoice. */
function invoice(row: ListRow): InvoiceRow {
  return row as InvoiceRow
}

/** Each amount is written in its own row's currency. */
const MONETARY = { currencyField: 'currency_code' }

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

/**
 * An invoice with payments or movements cannot be removed: `PROTECT` foreign
 * keys. The refusal is shown as-is -- the backend names the reason better.
 */
async function remove(row: InvoiceRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteInvoice(row.id)
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This invoice could not be deleted.'
  }
}

defineExpose({ reload: (): Promise<void> => list.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
    {{ deleteError }}
  </Message>

  <ListView
    ref="list"
    :fetch-page="listInvoices"
    :filters="filters"
    sort-field="date"
    :sort-order="-1"
    :sortable="INVOICE_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="invoices"
    :extra-fields="['number']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a number, a name or a reference…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-receipt" />
        <p v-if="filters.search">No invoice matches “{{ filters.search }}”.</p>
        <p v-else-if="activeFilters.length">No invoice matches these filters.</p>
        <p v-else>No invoice yet.</p>
      </div>
    </template>

    <Field name="number" label="Number" sortable :width="14">
      <template #default="{ value }">
        <span class="invoice-cell__number">{{ value }}</span>
      </template>
    </Field>

    <Field name="name" label="Name" />

    <Field name="reference" label="Reference" :width="12" />

    <!-- Newest first, the backend's own default. -->
    <Field name="date" widget="date" label="Date" sortable :width="10" />

    <Field name="due_date" widget="date" label="Due" sortable :width="10" />

    <Field
      name="contact"
      widget="many2one"
      label="Supplier"
      :options="{ relationDisplay: displayContact }"
    />

    <Field
      name="account"
      widget="many2one"
      label="Account"
      :width="16"
      :default-display="false"
      :options="{ relationDisplay: displayAccount }"
    />

    <Field
      name="category"
      widget="many2one"
      label="Category"
      :width="14"
      :default-display="false"
    />

    <!-- A monetary column asks for `currency_code` itself, ticked or not. -->
    <Field
      name="amount_total"
      widget="monetary"
      label="Total"
      sortable
      :width="12"
      :options="MONETARY"
    />

    <Field
      name="amount_paid"
      widget="monetary"
      label="Paid"
      sortable
      :width="12"
      :default-display="false"
      :options="MONETARY"
    />

    <Field
      name="amount_residual"
      widget="monetary"
      label="Due amount"
      sortable
      :width="12"
      :options="MONETARY"
    />

    <Field name="currency_code" label="Currency" :width="8" :default-display="false" />

    <Field name="payment_status" label="Status" :width="12">
      <template #default="{ value }">
        <Tag
          v-if="value"
          :value="invoicePaymentStatusLabel(value)"
          :severity="invoicePaymentStatusSeverity(value)"
        />
      </template>
    </Field>

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

    <template #actions="{ row }">
      <Button
        v-if="canUpdate"
        icon="pi pi-pencil"
        text
        rounded
        severity="secondary"
        aria-label="Edit"
        @click="emit('open', row.id)"
      />
      <DeleteButton
        v-if="canDelete"
        label="Delete this invoice?"
        :message="`“${row.number}” will be deleted, with its file.`"
        @confirm="remove(invoice(row))"
      />
    </template>
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

/* A number is an identifier, read character by character. */
.invoice-cell__number {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
</style>

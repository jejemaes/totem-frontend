<script setup lang="ts">
/*
 * The payment method table, with its filter bar -- and NOTHING that ties it to
 * a route: the routed page decides what opening a row means. See
 * ContactTagListView for the contract in full.
 *
 * Reorderable by drag: the order is the one a payment's dropdown offers the
 * methods in, and `sequence` is a number nobody should have to type. A handful
 * of rows, so the whole list sits on one page (ListView's non-paged
 * `resequence`) and the drop renumbers it from 1.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  deletePaymentMethod,
  formatIban,
  listPaymentMethods,
  PAYMENT_METHOD_SORTABLE,
  PAYMENT_METHOD_TYPE_CHOICES,
  resequencePaymentMethods,
  type PaymentMethodFilters,
  type PaymentMethodRow,
} from '@/resources/paymentMethods'

const props = withDefaults(
  defineProps<{
    /** Mirror page, sort and filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
    pageSize?: number
  }>(),
  { syncUrl: false, pageSize: 10 },
)

const emit = defineEmits<{
  /** The edit button of a row: what that means is up to the caller. */
  open: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.paymentmethod.update'))
const canDelete = computed(() => can('totem.paymentmethod.delete'))

/**
 * The resequence route, handed to <ListView> only when a drop can be saved:
 * numbering the methods is updating them, server-side. Decided once --
 * ListView reads it at creation.
 */
const resequence = canUpdate.value ? resequencePaymentMethods : undefined

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    // The IBAN has no filter of its own: the backend's search matches it, in
    // its stored form -- typed with spaces, a search finds nothing.
    help_text: 'Matches the code, the name or the IBAN (without spaces).',
  },
  type: {
    type: 'selection',
    // Several at once: the backend's `type` is a MultiValue. No `allowNull`:
    // it is declared `allow_null=False`, and a method always has a type.
    widget: 'many2many_tags',
    label: 'Type',
    help_text: 'Keep the methods of these types.',
    options: { choices: [...PAYMENT_METHOD_TYPE_CHOICES] },
  },
  active: {
    type: 'boolean',
    label: 'Active',
    help_text: 'Keep the active methods, or the archived ones.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<PaymentMethodFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

/**
 * A method used by a payment cannot be removed: that FK is
 * `on_delete=PROTECT`. The refusal is shown as-is -- the backend names the
 * reason better than a generic message would.
 */
async function remove(row: PaymentMethodRow): Promise<void> {
  deleteError.value = null
  try {
    await deletePaymentMethod(row.id)
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This payment method could not be deleted.'
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
    :fetch-page="listPaymentMethods"
    :filters="filters"
    sort-field="sequence"
    :sortable="PAYMENT_METHOD_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    :resequence="resequence"
    storage-key="payment-methods"
    :extra-fields="['code', 'name']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a code, a name or an IBAN…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-credit-card" />
        <p v-if="filters.search">No payment method matches “{{ filters.search }}”.</p>
        <p v-else>No payment method yet.</p>
      </div>
    </template>

    <Field name="code" label="Code" sortable :width="15">
      <template #default="{ value }">
        <span class="payment-method-cell__code">{{ value }}</span>
      </template>
    </Field>

    <Field name="name" label="Name" sortable />

    <Field
      name="type"
      widget="selection"
      label="Type"
      sortable
      :width="15"
      :options="{ choices: [...PAYMENT_METHOD_TYPE_CHOICES] }"
    />

    <!-- Printed by groups of four; empty on a cash method. -->
    <Field name="iban" label="IBAN" :width="25">
      <template #default="{ value }">
        <span class="payment-method-cell__code">{{ formatIban(value) }}</span>
      </template>
    </Field>

    <Field name="active" label="Active" :width="10">
      <template #default="{ value }">
        <Tag :value="value ? 'Active' : 'Archived'" :severity="value ? 'success' : 'secondary'" />
      </template>
    </Field>

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
        label="Delete this payment method?"
        :message="`“${row.code} · ${row.name}” will be deleted.`"
        @confirm="remove(row)"
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

/* A code or an IBAN is an identifier, read character by character. */
.payment-method-cell__code {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
</style>

<script setup lang="ts">
/*
 * The movements of ONE account, with their filter bar -- and nothing that ties
 * them to a route. See ContactTagListView for the contract in full.
 *
 * The account is a PROP, not a filter. It is injected into every request by
 * the fetchPage wrapper below and deliberately absent from FILTER_FIELDS: on
 * the routed page it lives in the path, so it has no business in the query
 * string, and the filter dialog must not let the user clear it -- that would
 * turn "this account's movements" into everyone's.
 *
 * Read once: a caller showing another account remounts this view (`:key`)
 * rather than changing the prop, because useResourceList only reloads on a
 * change of `filters`, which the account is not part of.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import type { ListQuery, Page } from '@/api/list'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  accountCategoryDisplayNames,
  searchApplicableCategories,
} from '@/resources/accountCategories'
import {
  ACCOUNT_MOVEMENT_SORTABLE,
  deleteAccountMovement,
  listAccountMovements,
  type AccountMovementFilters,
  type AccountMovementRow,
} from '@/resources/accountMovements'
import { amountDirection, formatAmount } from '@/resources/accounts'

const props = withDefaults(
  defineProps<{
    /** The account whose movements are listed. Fixed for the life of the view. */
    accountId: string
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
  /** A row was deleted: whatever the caller shows about the account (its balance) is stale. */
  deleted: [id: string]
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.accountmovement.update'))
const canDelete = computed(() => can('totem.accountmovement.delete'))

/**
 * The filters this screen offers, keyed by the query parameter the API takes.
 *
 * The category dropdown is narrowed with `applicable_to`, exactly like the
 * form's: offering another account's category would filter on something no
 * movement of this account can carry.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the name or the reference.',
  },
  category: {
    type: 'many2one',
    label: 'Category',
    help_text: 'Keep the movements filed under this category.',
    options: {
      fetch: searchApplicableCategories(props.accountId),
      resolve: accountCategoryDisplayNames,
      permission: 'totem.accountcategory.read',
    },
  },
  direction: {
    type: 'selection',
    label: 'Direction',
    help_text: 'Keep the expenses, or the revenues.',
    options: {
      choices: [
        { value: 'debit', label: 'Debit (expense)' },
        { value: 'credit', label: 'Credit (revenue)' },
      ],
    },
  },
  // Calendar days, both INCLUSIVE: the backend compares with gte / lte on a
  // DateField, so "to 16/10" keeps the 16th.
  date_from: {
    type: 'date',
    label: 'From',
    help_text: 'Movements on or after this day.',
  },
  date_to: {
    type: 'date',
    label: 'To',
    help_text: 'Movements on or before this day.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<AccountMovementFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/**
 * The fetcher with the account forced in. Spread LAST, so nothing in the
 * filter set -- not even a hand-edited URL -- can point it at another account.
 */
function fetchPage(
  query: ListQuery<AccountMovementFilters>,
  signal: AbortSignal,
): Promise<Page<AccountMovementRow>> {
  return listAccountMovements(
    { ...query, filters: { ...query.filters, account: props.accountId } },
    signal,
  )
}

/** A <Field> slot is handed a generic row: the helpers below want a movement. */
function movement(row: ListRow): AccountMovementRow {
  return row as AccountMovementRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

async function remove(row: AccountMovementRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteAccountMovement(row.id)
    emit('deleted', row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This movement could not be deleted.'
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
    :fetch-page="fetchPage"
    :filters="filters"
    sort-field="date"
    :sort-order="-1"
    :sortable="ACCOUNT_MOVEMENT_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="account-movements"
    :extra-fields="['name']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a name or a reference…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-list" />
        <p v-if="filters.search">No movement matches “{{ filters.search }}”.</p>
        <p v-else-if="activeFilters.length">No movement matches these filters.</p>
        <p v-else>No movement on this account yet.</p>
      </div>
    </template>

    <!-- Newest first, the backend's own default: a ledger is read from the top. -->
    <Field name="date" widget="date" label="Date" sortable :width="12" />

    <Field name="name" label="Name" sortable />

    <Field name="category" widget="many2one" label="Category" :width="18" />

    <Field name="amount" label="Amount" sortable align="end" :width="14">
      <template #default="{ row }">
        <div class="amount" :class="`amount--${amountDirection(movement(row).amount)}`">
          {{ formatAmount(movement(row).amount) }}
        </div>
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
        label="Delete this movement?"
        :message="`“${row.name}” will be removed, and the account balance with it.`"
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

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.amount--debit {
  color: var(--p-red-500);
}

.amount--credit {
  color: var(--p-primary-color);
}
</style>

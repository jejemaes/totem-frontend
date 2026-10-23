<script setup lang="ts">
/*
 * The account table, with its filter bar -- and NOTHING that ties it to a
 * route: the routed page decides what opening a row, or its movements, means.
 * See ContactTagListView for the contract in full.
 *
 * Unlike the other lists, a row has a THIRD way out: its movements. That is
 * an event of its own rather than a variant of `open`, so a caller embedding
 * this table can offer one without the other.
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
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  ACCOUNT_SORTABLE,
  amountDirection,
  deleteAccount,
  formatAmount,
  listAccounts,
  type AccountFilters,
  type AccountRow,
} from '@/resources/accounts'

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
  /** The movements button of a row. */
  movements: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.account.update'))
const canDelete = computed(() => can('totem.account.delete'))
const canReadMovements = computed(() => can('totem.accountmovement.read'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the code or the name.',
  },
  active: {
    type: 'boolean',
    label: 'Active',
    help_text: 'Keep the active accounts, or the archived ones.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<AccountFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A <Field> slot is handed a generic row: the helpers below want an account. */
function account(row: ListRow): AccountRow {
  return row as AccountRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

/**
 * An account holding movements cannot be removed: that FK is
 * `on_delete=PROTECT`. The refusal is shown as-is -- the backend names the
 * reason better than a generic message would.
 */
async function remove(row: AccountRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteAccount(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This account could not be deleted.'
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
    :fetch-page="listAccounts"
    :filters="filters"
    sort-field="code"
    :sortable="ACCOUNT_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="accounts"
    :extra-fields="['code', 'name']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a code or a name…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-book" />
        <p v-if="filters.search">No account matches “{{ filters.search }}”.</p>
        <p v-else>No account yet.</p>
      </div>
    </template>

    <!-- The backend's own default ordering: a chart of accounts reads by code. -->
    <Field name="code" label="Code" sortable :width="15">
      <template #default="{ value }">
        <span class="account-cell__code">{{ value }}</span>
      </template>
    </Field>

    <Field name="name" label="Name" sortable />

    <Field name="balance" label="Balance" sortable align="end" :width="15">
      <template #default="{ row }">
        <div class="amount" :class="`amount--${amountDirection(account(row).balance)}`">
          {{ formatAmount(account(row).balance) }}
        </div>
      </template>
    </Field>

    <Field name="active" label="Active" sortable :width="10">
      <template #default="{ value }">
        <Tag :value="value ? 'Active' : 'Archived'" :severity="value ? 'success' : 'secondary'" />
      </template>
    </Field>

    <template #actions="{ row }">
      <Button
        v-if="canReadMovements"
        icon="pi pi-list"
        text
        rounded
        severity="secondary"
        aria-label="Movements"
        title="Movements"
        @click="emit('movements', row.id)"
      />
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
        label="Delete this account?"
        :message="`“${row.code} · ${row.name}” and its own categories will be removed.`"
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

/* A code is an identifier, read character by character. */
.account-cell__code {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.amount--debit {
  color: var(--p-red-500);
}
</style>

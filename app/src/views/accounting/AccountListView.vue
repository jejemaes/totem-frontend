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
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
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

const confirm = useConfirm()

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

const {
  rows,
  total,
  loading,
  error,
  first,
  pageSize,
  sortField,
  sortOrder,
  isInitialLoad,
  onPage,
  onSort,
  reload,
} = useResourceList({
  fetchPage: listAccounts,
  filters,
  pageSize: props.pageSize,
  // The backend's own default ordering: a chart of accounts reads by code.
  sortField: 'code',
  syncUrl: props.syncUrl,
  sortable: ACCOUNT_SORTABLE,
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as AccountRow,
)

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
    void reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This account could not be deleted.'
  }
}

function askDelete(row: AccountRow): void {
  confirm.require({
    header: 'Delete this account?',
    message: `“${row.code} · ${row.name}” and its own categories will be removed.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => {
      void remove(row)
    },
  })
}

// On `loading` going false rather than on `total`: a reload landing on the same
// count must still be reported.
watch(loading, (busy) => {
  if (!busy && !error.value) emit('loaded', total.value)
})

defineExpose({ reload })
</script>

<template>
  <Message v-if="error" severity="error" :closable="false" class="page__message">
    <div class="list__error">
      <span>{{ error }}</span>
      <Button label="Retry" size="small" severity="danger" outlined @click="reload" />
    </div>
  </Message>

  <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
    {{ deleteError }}
  </Message>

  <DataTable
    lazy
    paginator
    row-hover
    data-key="id"
    removable-sort
    :value="isInitialLoad ? skeletonRows : rows"
    :total-records="total"
    :first="first"
    :rows="pageSize"
    :rows-per-page-options="[10, 20, 50, 100]"
    :sort-field="sortField ?? undefined"
    :sort-order="sortOrder"
    paginator-template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
    current-page-report-template="{first}–{last} of {totalRecords}"
    @page="onPage"
    @sort="onSort"
  >
    <template #header>
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

    <Column field="code" header="Code" sortable style="width: 12rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else class="account-cell__code">{{ data.code }}</span>
      </template>
    </Column>

    <Column field="name" header="Name" sortable style="min-width: 16rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <span v-else>{{ data.name }}</span>
      </template>
    </Column>

    <Column
      field="balance"
      header="Balance"
      sortable
      style="width: 12rem"
      header-class="amount-header"
    >
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <div v-else class="amount" :class="`amount--${amountDirection(data.balance)}`">
          {{ formatAmount(data.balance) }}
        </div>
      </template>
    </Column>

    <Column field="active" header="Active" sortable style="width: 8rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1.5rem" />
        <Tag
          v-else
          :value="data.active ? 'Active' : 'Archived'"
          :severity="data.active ? 'success' : 'secondary'"
        />
      </template>
    </Column>

    <Column style="width: 9rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" width="2rem" shape="circle" />
        <!-- A <div> of our own rather than styling the cell: `body-class` lands
             on a <td> PrimeVue renders, which a scoped rule never reaches. -->
        <div v-else class="row-actions__buttons">
          <Button
            v-if="canReadMovements"
            icon="pi pi-list"
            text
            rounded
            severity="secondary"
            aria-label="Movements"
            title="Movements"
            @click="emit('movements', data.id)"
          />
          <Button
            v-if="canUpdate"
            icon="pi pi-pencil"
            text
            rounded
            severity="secondary"
            aria-label="Edit"
            @click="emit('open', data.id)"
          />
          <Button
            v-if="canDelete"
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            aria-label="Delete"
            @click="askDelete(data)"
          />
        </div>
      </template>
    </Column>
  </DataTable>
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

:deep(.amount-header .p-datatable-column-header-content) {
  justify-content: flex-end;
}

.row-actions__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.list__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

<script setup lang="ts">
/*
 * The budget table, with its filter bar -- and NOTHING that ties it to a
 * route. See ContactTagListView for the contract in full.
 *
 * The one departure from the other lists: this endpoint has no `search`, its
 * free-text filter is `name`. The toolbar box is bound to that key through
 * `searchKey`, on BOTH useFilter and <MultiRecordFilters> -- set on one only,
 * the badge would count the box as a hidden filter, or the box would write a
 * `search` the backend ignores.
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
import MultiRecordFilters from '@/components/list/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/list/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
import {
  accountDisplayNames,
  displayAccount,
  formatAmount,
  searchAccounts,
} from '@/resources/accounts'
import {
  BUDGET_SORTABLE,
  deleteBudget,
  listBudgets,
  type BudgetFilters,
  type BudgetRow,
} from '@/resources/budgets'
import { displayUser, searchUsers, userDisplayNames } from '@/resources/users'

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

const confirm = useConfirm()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.budget.update'))
const canDelete = computed(() => can('totem.budget.delete'))

/** The key the toolbar box writes: this endpoint's own free-text filter. */
const SEARCH_KEY = 'name'

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL.
 */
const FILTER_FIELDS: FilterFields = {
  name: {
    type: 'string',
    label: 'Name',
    help_text: 'Matches the budget name, case-insensitive.',
  },
  account: {
    type: 'many2one',
    label: 'Account',
    help_text: 'Keep the budgets of this account.',
    options: {
      fetch: searchAccounts,
      // What labels an account restored from the URL: a filter has no nested
      // record to show, only the id the link carried.
      resolve: accountDisplayNames,
      relationDisplay: displayAccount,
      permission: 'totem.account.read',
    },
  },
  user: {
    type: 'many2one',
    label: 'User',
    help_text: 'Keep the budgets this user is in charge of.',
    options: {
      fetch: searchUsers,
      resolve: userDisplayNames,
      relationDisplay: displayUser,
      permission: 'totem.user.read',
    },
  },
  active: {
    type: 'boolean',
    label: 'Active',
    help_text: 'Keep the active budgets, or the archived ones.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<BudgetFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl, searchKey: SEARCH_KEY },
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
  fetchPage: listBudgets,
  filters,
  pageSize: props.pageSize,
  sortField: 'name',
  syncUrl: props.syncUrl,
  sortable: BUDGET_SORTABLE,
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as BudgetRow,
)

const deleteError = ref<string | null>(null)

async function remove(row: BudgetRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteBudget(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This budget could not be deleted.'
  }
}

function askDelete(row: BudgetRow): void {
  confirm.require({
    header: 'Delete this budget?',
    message: `“${row.name}” will be removed, with its positions and lines.`,
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
        :search-key="SEARCH_KEY"
        search-placeholder="Search a budget name…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-chart-pie" />
        <p v-if="filters.name">No budget matches “{{ filters.name }}”.</p>
        <p v-else-if="activeFilters.length">No budget matches these filters.</p>
        <p v-else>No budget yet.</p>
      </div>
    </template>

    <Column field="name" header="Name" sortable style="min-width: 14rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <span v-else>{{ data.name }}</span>
      </template>
    </Column>

    <Column field="account" header="Account" style="min-width: 12rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.account">{{ displayAccount(data.account) }}</span>
      </template>
    </Column>

    <Column field="user" header="User" style="width: 10rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.user">{{ displayUser(data.user) }}</span>
        <span v-else class="budget-cell__none">—</span>
      </template>
    </Column>

    <Column
      field="total_planned_amount"
      header="Planned"
      sortable
      style="width: 10rem"
      header-class="amount-header"
    >
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <div v-else class="amount">{{ formatAmount(data.total_planned_amount) }}</div>
      </template>
    </Column>

    <Column
      field="total_practical_amount"
      header="Actual"
      sortable
      style="width: 10rem"
      header-class="amount-header"
    >
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <div v-else class="amount">{{ formatAmount(data.total_practical_amount) }}</div>
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

    <Column style="width: 6rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" width="2rem" shape="circle" />
        <!-- A <div> of our own rather than styling the cell: `body-class` lands
             on a <td> PrimeVue renders, which a scoped rule never reaches. -->
        <div v-else class="row-actions__buttons">
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

.budget-cell__none {
  color: var(--app-muted);
}

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
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

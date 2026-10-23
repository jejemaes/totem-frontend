<script setup lang="ts">
/*
 * The accounting category table, with its filter bar -- and NOTHING that ties
 * it to a route. See ContactTagListView for the contract in full.
 *
 * The `account` filter is the OWNER, not `applicable_to`: this screen manages
 * categories, so "the ones belonging to BANK" is the question, and mixing the
 * general ones in would make every account look like it owns them.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import ColorDot from '@/components/ColorDot.vue'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
import {
  ACCOUNT_CATEGORY_SORTABLE,
  deleteAccountCategory,
  listAccountCategories,
  type AccountCategoryFilters,
  type AccountCategoryRow,
} from '@/resources/accountCategories'
import { accountDisplayNames, displayAccount, searchAccounts } from '@/resources/accounts'

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
const canUpdate = computed(() => can('totem.accountcategory.update'))
const canDelete = computed(() => can('totem.accountcategory.delete'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the category name.',
  },
  account: {
    type: 'many2one',
    label: 'Account',
    help_text: 'Keep the categories owned by this account. General ones are left out.',
    options: {
      fetch: searchAccounts,
      resolve: accountDisplayNames,
      relationDisplay: displayAccount,
      permission: 'totem.account.read',
    },
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<AccountCategoryFilters>(
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
  fetchPage: listAccountCategories,
  filters,
  pageSize: props.pageSize,
  sortField: 'name',
  syncUrl: props.syncUrl,
  sortable: ACCOUNT_CATEGORY_SORTABLE,
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as AccountCategoryRow,
)

const deleteError = ref<string | null>(null)

async function remove(row: AccountCategoryRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteAccountCategory(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This category could not be deleted.'
  }
}

function askDelete(row: AccountCategoryRow): void {
  confirm.require({
    header: 'Delete this category?',
    // SET_NULL on the movement side: worth saying, since nothing else warns.
    message: `“${row.name}” will be removed. Its movements are kept, uncategorised.`,
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
        search-placeholder="Search a category name…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-tags" />
        <p v-if="filters.search">No category matches “{{ filters.search }}”.</p>
        <p v-else>No category yet.</p>
      </div>
    </template>

    <Column field="name" header="Name" sortable style="min-width: 16rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <span v-else>{{ data.name }}</span>
      </template>
    </Column>

    <Column field="color" header="Colour" sortable style="width: 8rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <ColorDot v-else :color="data.color" />
      </template>
    </Column>

    <Column field="account" header="Account" style="min-width: 14rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.account">{{ displayAccount(data.account) }}</span>
        <!-- No owner means usable everywhere: say so rather than leave a hole. -->
        <span v-else class="category-cell__general">General</span>
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

.category-cell__general {
  color: var(--app-muted);
  font-style: italic;
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

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
  /** The chart button of a row: its positions, charted. Up to the caller too. */
  chart: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

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

/** A <Field> slot is handed a generic row: the helpers below want a budget. */
function budget(row: ListRow): BudgetRow {
  return row as BudgetRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

async function remove(row: BudgetRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteBudget(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This budget could not be deleted.'
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
    :fetch-page="listBudgets"
    :filters="filters"
    sort-field="name"
    :sortable="BUDGET_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="budgets"
    :extra-fields="['name']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
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

    <Field name="name" label="Name" sortable />

    <Field name="account" widget="many2one" label="Account"
           :options="{ relationDisplay: displayAccount }" />

    <Field name="user" widget="many2one" label="User" :options="{ relationDisplay: displayUser }"
           :width="12" />

    <Field name="total_planned_amount" label="Planned" sortable align="end" :width="12">
      <template #default="{ row }">
        <div class="amount">{{ formatAmount(budget(row).total_planned_amount) }}</div>
      </template>
    </Field>

    <Field name="total_practical_amount" label="Actual" sortable align="end" :width="12">
      <template #default="{ row }">
        <div class="amount">{{ formatAmount(budget(row).total_practical_amount) }}</div>
      </template>
    </Field>

    <Field name="active" label="Active" sortable :width="10">
      <template #default="{ value }">
        <Tag :value="value ? 'Active' : 'Archived'" :severity="value ? 'success' : 'secondary'" />
      </template>
    </Field>

    <template #actions="{ row }">
      <!-- No permission check: reading the budget is what shows this list. -->
      <Button
        icon="pi pi-chart-bar"
        text
        rounded
        severity="secondary"
        aria-label="Chart"
        @click="emit('chart', row.id)"
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
        label="Delete this budget?"
        :message="`“${row.name}” will be removed, with its positions and lines.`"
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
</style>

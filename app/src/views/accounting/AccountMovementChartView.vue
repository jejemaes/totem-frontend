<script setup lang="ts">
/*
 * The movements of ONE account as a chart, with the list's filter bar -- and
 * nothing that ties it to a route. AccountMovementListView's twin: same
 * account prop, same filters (accountMovementFilters.ts), same query string.
 *
 * The account is forced into every request exactly as the list forces it:
 * spread LAST, so nothing in the filter set can point the chart elsewhere. It
 * is for the same reason not offered as a dimension -- grouping one account's
 * movements by account draws a single bar.
 *
 * Read once, like the list: a caller showing another account remounts this
 * view (`:key`).
 */
import type { GroupPage, GroupQuery } from '@/api/groupBy'
import ChartView from '@/components/chart/ChartView.vue'
import Field from '@/components/chart/Field.vue'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import { useFilter } from '@/composables/useFilter'
import {
  groupAccountMovements,
  type AccountMovementDimension,
  type AccountMovementFilters,
  type AccountMovementMeasure,
} from '@/resources/accountMovements'

import { accountMovementFilterFields } from './accountMovementFilters'

const props = withDefaults(
  defineProps<{
    /** The account whose movements are charted. Fixed for the life of the view. */
    accountId: string
    /** Mirror the filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
  }>(),
  { syncUrl: false },
)

const emit = defineEmits<{
  /** Every settled response: the number of groups. */
  loaded: [total: number]
}>()

/** Shared with the list: see accountMovementFilters.ts. */
const FILTER_FIELDS = accountMovementFilterFields(props.accountId)

const { filters, setFilters, updateFilters, activeFilters } = useFilter<AccountMovementFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** Typed against the resource, so a renamed backend name is a compile error here. */
const DEFAULT_DIMENSIONS: AccountMovementDimension[] = ['date_month']
const DEFAULT_MEASURES: AccountMovementMeasure[] = ['amount_sum']

function fetchGroups(
  query: GroupQuery<AccountMovementFilters>,
  signal: AbortSignal,
): Promise<GroupPage> {
  return groupAccountMovements(
    { ...query, filters: { ...query.filters, account: props.accountId } },
    signal,
  )
}
</script>

<template>
  <ChartView
    :fetch-groups="fetchGroups"
    :filters="filters"
    :default-dimensions="DEFAULT_DIMENSIONS"
    :default-measures="DEFAULT_MEASURES"
    default-type="bar"
    :allowed-types="['bar', 'line', 'pie']"
    :sync-url="syncUrl"
    storage-key="account-movements"
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
      <div class="chart-empty">
        <i class="pi pi-chart-bar" />
        <p v-if="activeFilters.length || filters.search">No movement matches these filters.</p>
        <p v-else>No movement on this account yet.</p>
      </div>
    </template>

    <Field
      name="date_month"
      type="dimension"
      widget="date"
      label="Date"
      :options="{ period: 'month' }"
      sortable
    />
    <Field
      name="category"
      type="dimension"
      widget="many2one"
      label="Category"
      help="The general categories and this account's own."
      sortable
    />
    <Field
      name="date_day"
      type="dimension"
      widget="date"
      label="Date"
      :options="{ period: 'day' }"
      sortable
    />
    <Field
      name="date_week"
      type="dimension"
      widget="date"
      label="Date"
      :options="{ period: 'week' }"
      sortable
    />
    <Field
      name="date_quarter"
      type="dimension"
      widget="date"
      label="Date"
      :options="{ period: 'quarter' }"
      sortable
    />
    <Field
      name="date_year"
      type="dimension"
      widget="date"
      label="Date"
      :options="{ period: 'year' }"
      sortable
    />

    <Field name="amount_sum" type="measure" label="Balance" sortable />
    <Field name="debit_sum" type="measure" label="Debits" sortable />
    <Field name="credit_sum" type="measure" label="Credits" sortable />
    <Field name="count" type="measure" widget="integer" label="Count" sortable />
    <Field name="amount_avg" type="measure" label="Average amount" sortable />
    <Field name="amount_min" type="measure" label="Smallest amount" sortable />
    <Field name="amount_max" type="measure" label="Largest amount" sortable />
    <Field
      name="amount_share"
      type="measure"
      label="Share of the period (%)"
      help="Each category's share of the total of its period."
      sortable
    />
  </ChartView>
</template>

<style scoped>
.chart-empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  color: var(--app-muted);
}

.chart-empty i {
  font-size: 1.5rem;
}
</style>

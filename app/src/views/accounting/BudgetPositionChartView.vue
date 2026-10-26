<script setup lang="ts">
/*
 * The positions of ONE budget as a chart -- planned against practical, per
 * category -- and nothing that ties it to a route. See
 * AccountMovementChartView for the shape.
 *
 * The budget is in the request PATH, not in the filters: nothing in the filter
 * set, not even a hand-edited URL, can point the chart at another budget, and
 * there is nothing to force in.
 *
 * Read once: a caller showing another budget remounts this view (`:key`).
 */
import type { GroupPage, GroupQuery } from '@/api/groupBy'
import ChartView from '@/components/chart/ChartView.vue'
import Field from '@/components/chart/Field.vue'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import { useFilter } from '@/composables/useFilter'
import {
  groupBudgetPositions,
  type BudgetPositionDimension,
  type BudgetPositionFilters,
  type BudgetPositionMeasure,
} from '@/resources/budgetPositions'

const props = withDefaults(
  defineProps<{
    /** The budget whose positions are charted. Fixed for the life of the view. */
    budgetId: string
    /** Mirror the filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
  }>(),
  { syncUrl: false },
)

const emit = defineEmits<{
  /** Every settled response: the number of groups. */
  loaded: [total: number]
}>()

/** The key the toolbar box writes: this endpoint's own free-text filter. */
const SEARCH_KEY = 'name'

const FILTER_FIELDS: FilterFields = {
  name: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the category name.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<BudgetPositionFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl, searchKey: SEARCH_KEY },
)

/** Typed against the resource, so a renamed backend name is a compile error here. */
const DEFAULT_DIMENSIONS: BudgetPositionDimension[] = ['category']
const DEFAULT_MEASURES: BudgetPositionMeasure[] = ['total_planned_sum', 'total_practical_sum']

function fetchGroups(
  query: GroupQuery<BudgetPositionFilters>,
  signal: AbortSignal,
): Promise<GroupPage> {
  return groupBudgetPositions(props.budgetId, query, signal)
}
</script>

<template>
  <ChartView
    :fetch-groups="fetchGroups"
    :filters="filters"
    :default-dimensions="DEFAULT_DIMENSIONS"
    :default-measures="DEFAULT_MEASURES"
    default-type="bar"
    :sync-url="syncUrl"
    storage-key="budget-positions"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :search-key="SEARCH_KEY"
        :loading="loading"
        search-placeholder="Search a category…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="chart-empty">
        <i class="pi pi-chart-bar" />
        <p v-if="filters.name">No position matches “{{ filters.name }}”.</p>
        <p v-else>No position in this budget yet.</p>
      </div>
    </template>

    <Field name="category" type="dimension" widget="many2one" label="Category" sortable />

    <Field name="total_planned_sum" type="measure" label="Total of planned amount" sortable />
    <Field name="total_practical_sum" type="measure" label="Total of practical amount" sortable />
    <Field name="total_planned_avg" type="measure" label="Average planned amount" sortable />
    <Field name="total_practical_avg" type="measure" label="Average practical amount" sortable />
    <Field name="count" type="measure" widget="integer" label="Positions" sortable />
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

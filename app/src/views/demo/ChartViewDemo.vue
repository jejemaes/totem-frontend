<script setup lang="ts">
/*
 * <ChartView> run against an in-memory ledger, for /form-demo.
 *
 * Offline like the rest of that page: `fetchGroups` is a callback, so a fake
 * honouring the backend's contract -- dimensions in order, measures, one
 * ordering, the search filter, null for a sum over nothing -- exercises the
 * whole framework with no backend and no session. The last body is printed
 * under the chart: picking a chip must show up there in the order picked.
 */
import { ref } from 'vue'

import { groupByBody, type Group, type GroupPage, type GroupQuery } from '@/api/groupBy'
import ChartView from '@/components/chart/ChartView.vue'
import Field from '@/components/chart/Field.vue'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import { useFilter } from '@/composables/useFilter'

type DemoFilters = { search?: string | null }

type Movement = {
  name: string
  category: { id: string; name: string } | null
  date_month: string
  direction: 'debit' | 'credit'
  amount: number
}

const CATEGORIES = [
  { id: 'rent', name: 'Rent' },
  { id: 'stock', name: 'Stock' },
  { id: 'fees', name: 'Fees' },
]

const LEDGER: Movement[] = Array.from({ length: 48 }, (_, i) => {
  const amount = ((i * 731) % 400) - 150
  return {
    name: `Movement ${i + 1}`,
    // One in five has no category: its group must still be drawn.
    category: i % 5 === 0 ? null : CATEGORIES[i % CATEGORIES.length],
    date_month: `2026-${String((i % 6) + 4).padStart(2, '0')}-01`,
    direction: amount < 0 ? 'debit' : 'credit',
    amount: amount === 0 ? 10 : amount,
  }
})

const MEASURES: Record<string, (rows: Movement[]) => number | string | null> = {
  count: (rows) => rows.length,
  // Decimal strings, as the backend serialises a Decimal.
  amount_sum: (rows) => rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2),
  // null when nothing is summed: the backend's SUM over no row.
  debit_sum: (rows) => {
    const debits = rows.filter((row) => row.amount < 0)
    return debits.length ? debits.reduce((sum, row) => sum + row.amount, 0).toFixed(2) : null
  },
  credit_sum: (rows) => {
    const credits = rows.filter((row) => row.amount > 0)
    return credits.length ? credits.reduce((sum, row) => sum + row.amount, 0).toFixed(2) : null
  },
}

const FILTER_FIELDS: FilterFields = {
  search: { type: 'string', label: 'Search', help_text: 'Matches the name.' },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<DemoFilters>(
  FILTER_FIELDS,
  { syncUrl: false },
)

const lastBody = ref('')

function sortKey(value: unknown): string | number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number.isFinite(Number(value)) ? Number(value) : value
  if (value && typeof value === 'object') return (value as { name: string }).name
  return ''
}

async function fetchGroups(query: GroupQuery<DemoFilters>): Promise<GroupPage> {
  lastBody.value = JSON.stringify(groupByBody(query), null, 2)
  await new Promise((resolve) => setTimeout(resolve, 150))

  const search = query.filters?.search?.trim().toLowerCase()
  const rows = search ? LEDGER.filter((row) => row.name.toLowerCase().includes(search)) : LEDGER

  const buckets = new Map<string, Movement[]>()
  for (const row of rows) {
    const key = JSON.stringify(query.dimensions.map((name) => row[name as keyof Movement]))
    buckets.set(key, [...(buckets.get(key) ?? []), row])
  }

  const groups: Group[] = [...buckets.values()].map((members) => {
    const group: Group = {}
    for (const name of query.dimensions) group[name] = members[0][name as keyof Movement]
    for (const name of query.measures) group[name] = MEASURES[name]?.(members) ?? null
    return group
  })

  // The dimensions not ordered on follow, as the backend does.
  const keys = [
    ...(query.ordering ? [query.ordering] : []),
    ...query.dimensions.filter((name) => name !== query.ordering?.replace(/^-/, '')),
  ]
  groups.sort((a, b) => {
    for (const key of keys) {
      const name = key.replace(/^-/, '')
      const [left, right] = [sortKey(a[name]), sortKey(b[name])]
      if (left === right) continue
      const order = left < right ? -1 : 1
      return key.startsWith('-') ? -order : order
    }
    return 0
  })

  return { count: groups.length, results: groups }
}
</script>

<template>
  <ChartView
    :fetch-groups="fetchGroups"
    :filters="filters"
    :default-dimensions="['date_month']"
    :default-measures="['amount_sum']"
    storage-key="demo"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <Field
      name="date_month"
      type="dimension"
      widget="date"
      label="Date"
      :options="{ period: 'month' }"
      sortable
    />
    <Field name="category" type="dimension" widget="many2one" label="Category" sortable />
    <Field
      name="direction"
      type="dimension"
      widget="selection"
      label="Direction"
      :options="{ choices: [{ value: 'debit', label: 'Debit' }, { value: 'credit', label: 'Credit' }] }"
    />

    <Field name="amount_sum" type="measure" label="Balance" sortable />
    <Field name="debit_sum" type="measure" label="Debits" sortable />
    <Field name="credit_sum" type="measure" label="Credits" sortable />
    <Field name="count" type="measure" widget="integer" label="Count" sortable />
  </ChartView>

  <p class="note">The last request body:</p>
  <pre class="preview">{{ lastBody }}</pre>
</template>

<style scoped>
.note {
  margin: 1rem 0 0.25rem;
  color: var(--app-muted);
  font-size: 0.9rem;
}

.preview {
  margin: 0;
  padding: 0.75rem;
  border-radius: 6px;
  background: var(--app-inset);
  font-size: 0.8rem;
  overflow-x: auto;
}
</style>

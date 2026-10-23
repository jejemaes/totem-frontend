<script setup lang="ts">
/*
 * <ListView> run against an in-memory table, for /form-demo.
 *
 * Offline like the rest of that page: `fetchPage` and `resequence` are
 * callbacks, so a fake store honouring the same contract -- paging, ordering,
 * the search filter and, above all, `?fields=` -- exercises the whole
 * framework with no backend and no session. The last query is printed under
 * the table: ticking a column in the cog must show up there as a new field.
 */
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import { ref } from 'vue'

import type { ListQuery, Page } from '@/api/list'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import Field from '@/components/list/Field.vue'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'

type DemoRow = {
  id: string
  name: string
  code: string
  active: boolean | null
  quantity: number
  amount: string
  due_date: string | null
  seen_at: string
  status: string
  color: number | null
  country: { id: string; name: string } | null
  tags: { id: string; name: string; color: number }[]
  sequence: number
}

type DemoFilters = {
  search?: string | null
  active?: boolean | string | null
}

const COUNTRIES = [
  { id: 'BE', name: 'Belgium' },
  { id: 'FR', name: 'France' },
  { id: 'NL', name: 'Netherlands' },
]
const TAGS = [
  { id: 't1', name: 'VIP', color: 3 },
  { id: 't2', name: 'Supplier', color: 9 },
  { id: 't3', name: 'Press', color: 12 },
]
const STATUSES = ['draft', 'sent', 'done', 'archived']

function makeRow(index: number): DemoRow {
  const n = index + 1
  return {
    id: `row-${n}`,
    name: `Kiosk ${String(n).padStart(2, '0')}`,
    code: `K-${1000 + n * 7}`,
    // A third of the rows have no answer: "unknown" must not read as "no".
    active: n % 3 === 0 ? null : n % 2 === 0,
    quantity: (n * 13) % 40,
    amount: ((n * 1234.567) % 9999).toFixed(2),
    due_date: n % 5 === 0 ? null : `2024-${String((n % 12) + 1).padStart(2, '0')}-${String((n % 27) + 1).padStart(2, '0')}`,
    seen_at: new Date(Date.UTC(2024, 2, 1 + (n % 28), n % 24, 15)).toISOString(),
    status: STATUSES[n % STATUSES.length],
    color: n % 4 === 0 ? null : n % 16,
    country: n % 6 === 0 ? null : COUNTRIES[n % COUNTRIES.length],
    tags: TAGS.filter((_, tag) => (n + tag) % 3 === 0),
    sequence: n * 10,
  }
}

const TABLE = ref<DemoRow[]>(Array.from({ length: 57 }, (_, i) => makeRow(i)))
const STEPS = ref<DemoRow[]>(Array.from({ length: 6 }, (_, i) => makeRow(i)))

const lastQuery = ref<string>('')
const failNext = ref(false)

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'object') return compare((a as { name: string }).name, (b as { name: string }).name)
  return a < b ? -1 : 1
}

/** The same contract as a resource's `listXxx()`, over an array. */
function fakeFetch(source: () => DemoRow[], shown: boolean) {
  return (query: ListQuery<DemoFilters>, signal: AbortSignal): Promise<Page<DemoRow>> => {
    if (shown) lastQuery.value = JSON.stringify(query, null, 2)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (failNext.value) {
          failNext.value = false
          reject(new Error('The demo store refused this request.'))
          return
        }
        let rows = [...source()]
        const search = String(query.filters?.search ?? '').trim().toLowerCase()
        if (search) rows = rows.filter((row) => `${row.name} ${row.code}`.toLowerCase().includes(search))
        const active = query.filters?.active
        if (active !== null && active !== undefined && active !== '') {
          rows = rows.filter((row) => row.active === (active === true || active === 'true'))
        }
        if (query.ordering) {
          const desc = query.ordering.startsWith('-')
          const key = query.ordering.replace(/^-/, '') as keyof DemoRow
          rows.sort((a, b) => compare(a[key], b[key]) * (desc ? -1 : 1))
        }
        const start = (query.page - 1) * query.pageSize
        const page = rows.slice(start, start + query.pageSize)
        // `?fields=` honoured like the backend does: only the keys asked for.
        const fields = query.fields
        const results = fields?.length
          ? page.map((row) =>
              Object.fromEntries(fields.map((key) => [key, row[key as keyof DemoRow]])) as DemoRow,
            )
          : page
        resolve({ count: rows.length, next: null, previous: null, results })
      }, 400)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
  }
}

const fetchTable = fakeFetch(() => TABLE.value, true)
const fetchSteps = fakeFetch(() => STEPS.value, false)

async function resequenceSteps(ids: string[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const byId = new Map(STEPS.value.map((row) => [row.id, row]))
  STEPS.value = ids.map((id, index) => ({ ...byId.get(id)!, sequence: (index + 1) * 10 }))
}

const FILTER_FIELDS: FilterFields = {
  search: { type: 'string', label: 'Search', help_text: 'Matches the name or the code.' },
  active: { type: 'boolean', label: 'Active', help_text: 'Keep the active kiosks.' },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<DemoFilters>(
  FILTER_FIELDS,
  { syncUrl: false },
)

const SORTABLE = ['name', 'code', 'quantity', 'amount', 'due_date', 'status'] as const

const mode = ref<'display' | 'selection'>('display')
const selection = ref<string[]>(['row-2', 'row-15'])
const selectedNames = ref<string[]>([])
const opened = ref<string | null>(null)
</script>

<template>
  <div class="list-demo">
    <div class="list-demo__controls">
      <SelectButton
        v-model="mode"
        :options="['display', 'selection']"
        :allow-empty="false"
        aria-label="Mode"
      />
      <label class="list-demo__switch">
        <ToggleSwitch v-model="failNext" />
        Fail the next request
      </label>
    </div>

    <!-- Keyed on the mode: a ListView is created in one mode and stays in it,
         like a view a Dialog remounts per open. -->
    <ListView
      :key="mode"
      v-model:selection="selection"
      :fetch-page="fetchTable"
      :filters="filters"
      sort-field="name"
      :sortable="SORTABLE"
      :mode="mode"
      storage-key="form-demo"
      empty-text="No kiosk matches."
      @selection-rows="selectedNames = $event.map((row) => row.name)"
    >
      <template #header="{ loading, reload }">
        <MultiRecordFilters
          :fields="FILTER_FIELDS"
          :filters="filters"
          :active-filters="activeFilters"
          :loading="loading"
          search-placeholder="Search a name or a code…"
          @apply="setFilters"
          @patch="updateFilters"
          @refresh="reload"
        />
      </template>

      <Field name="name" label="Name" sortable :width="16">
        <template #default="{ row }">
          <strong>{{ row.name }}</strong>
        </template>
      </Field>
      <Field name="code" label="Code" sortable help="Not in the search: filter on the name." />
      <Field name="active" widget="boolean" label="Active" />
      <Field name="quantity" widget="integer" label="Qty" sortable />
      <Field name="amount" widget="float" label="Amount" sortable
             :options="{ maxFractionDigits: 2 }" />
      <Field name="due_date" widget="date" label="Due" sortable />
      <Field name="seen_at" widget="datetime" label="Seen at" :default-display="false" />
      <Field name="status" widget="selection" label="Status" sortable
             :options="{ choices: [
               { value: 'draft', label: 'Draft' },
               { value: 'sent', label: 'Sent' },
               { value: 'done', label: 'Done' },
             ] }"
             help="'archived' has no label: it shows raw." />
      <Field name="color" widget="color" label="Colour" :default-display="false" />
      <Field name="country" widget="many2one" label="Country" />
      <Field name="tags" widget="many2many_tags" label="Tags" :default-display="false"
             help="Hidden by default: tick it in the cog, the request gains `tags`." />

      <template #actions="{ row }">
        <Button icon="pi pi-pencil" text rounded size="small" severity="secondary"
                aria-label="Edit" @click="opened = String(row.id)" />
      </template>
    </ListView>

    <p v-if="mode === 'selection'" class="note">
      Selected ids: {{ selection.join(', ') || 'none' }}
      — labelled so far: {{ selectedNames.join(', ') || 'none' }}
    </p>
    <p v-else class="note">Last pencil: {{ opened ?? 'none' }}</p>

    <h3>The last query</h3>
    <pre class="preview">{{ lastQuery }}</pre>

    <h3>Reorderable</h3>
    <p class="note">`resequence` given: every row on one page, no header sort, a drag handle.</p>
    <ListView :fetch-page="fetchSteps" :resequence="resequenceSteps" paginator="compact">
      <Field name="name" label="Step" />
      <Field name="sequence" widget="integer" label="Sequence" />
    </ListView>
  </div>
</template>

<style scoped>
.list-demo {
  display: grid;
  gap: 0.75rem;
}

.list-demo__controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.list-demo__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.preview {
  margin: 0;
  padding: 0.75rem;
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  font-size: 0.8rem;
  line-height: 1.5;
}

h3 {
  margin: 1rem 0 0;
  font-size: 1rem;
}
</style>

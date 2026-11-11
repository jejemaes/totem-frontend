<script setup lang="ts">
/*
 * <CardView> run against an in-memory table, for /form-demo.
 *
 * Offline like the rest of that page: `fetchPage` is a callback, so a fake
 * store honouring the same contract -- paging, ordering, the filters and, above
 * all, `?fields=` -- exercises the whole view with no backend. The last query
 * is printed under the grid: the keys the cards' <Field>s declared must be
 * there, and nothing else.
 */
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { ref } from 'vue'

import type { ListQuery, Page } from '@/api/list'
import Field from '@/components/card/Field.vue'
import CardView from '@/components/card/CardView.vue'
import type { CardMenuItem } from '@/components/card/fields/types'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import { useFilter } from '@/composables/useFilter'

type DemoDocument = {
  id: string
  name: string
  summary: string
  state: 'draft' | 'published'
  pages: number
  updated_at: string
  author: { id: string; name: string } | null
  tags: { id: string; name: string; color: number }[]
  cover: { id: string; name: string; url: string } | null
}

type DemoFilters = {
  search?: string | null
  state?: string | null
}

const AUTHORS = [
  { id: 'a1', name: 'Ada Lovelace' },
  { id: 'a2', name: 'Grace Hopper' },
  { id: 'a3', name: 'Alan Turing' },
]
const TAGS = [
  { id: 't1', name: 'Policy', color: 3 },
  { id: 't2', name: 'Draft', color: 9 },
  { id: 't3', name: 'Press', color: 12 },
]
const SUMMARIES = [
  'How the reception kiosks are configured, updated and monitored across every site.',
  'Short note.',
  'The yearly report of the facilities team, covering the maintenance of the totems, the ' +
    'incidents of the winter, the new sites opened in the spring and the budget for next year.',
]

/** A tiny inline picture, so the demo needs no media server. */
function cover(n: number): DemoDocument['cover'] {
  if (n % 4 === 0) return null
  const hue = (n * 47) % 360
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9">` +
    `<rect width="16" height="9" fill="hsl(${hue} 45% 55%)"/></svg>`
  return { id: `m${n}`, name: `Cover ${n}`, url: `data:image/svg+xml,${encodeURIComponent(svg)}` }
}

function makeDocument(index: number): DemoDocument {
  const n = index + 1
  return {
    id: `doc-${n}`,
    name: `Document ${String(n).padStart(2, '0')}`,
    summary: SUMMARIES[n % SUMMARIES.length],
    state: n % 3 === 0 ? 'published' : 'draft',
    pages: (n * 7) % 30,
    updated_at: new Date(Date.UTC(2026, 9, 1 + (n % 28), n % 24, 10)).toISOString(),
    author: n % 5 === 0 ? null : AUTHORS[n % AUTHORS.length],
    tags: TAGS.filter((_, tag) => (n + tag) % 3 === 0),
    cover: cover(n),
  }
}

const TABLE: DemoDocument[] = Array.from({ length: 29 }, (_, i) => makeDocument(i))

const lastQuery = ref('')
const failNext = ref(false)

function fetchDocuments(
  query: ListQuery<DemoFilters>,
  signal: AbortSignal,
): Promise<Page<DemoDocument>> {
  lastQuery.value = JSON.stringify(query, null, 2)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (failNext.value) {
        failNext.value = false
        reject(new Error('The demo store refused this request.'))
        return
      }
      let rows = [...TABLE]
      const search = String(query.filters?.search ?? '').trim().toLowerCase()
      if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search))
      const state = query.filters?.state
      if (state) rows = rows.filter((row) => row.state === state)
      const start = (query.page - 1) * query.pageSize
      const page = rows.slice(start, start + query.pageSize)
      // `?fields=` honoured like the backend does: only the keys asked for.
      const fields = query.fields
      const results = fields?.length
        ? page.map(
            (row) =>
              Object.fromEntries(
                fields.map((key) => [key, row[key as keyof DemoDocument]]),
              ) as DemoDocument,
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

const STATE_CHOICES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
]

const FILTER_FIELDS: FilterFields = {
  search: { type: 'string', label: 'Search', help_text: 'Matches the name.' },
  state: { type: 'selection', label: 'State', options: { choices: STATE_CHOICES } },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<DemoFilters>(
  FILTER_FIELDS,
  { syncUrl: false },
)

const mode = ref<'display' | 'selection'>('display')
const selection = ref<string[]>(['doc-2'])
const selectedNames = ref<string[]>([])
const lastAction = ref<string | null>(null)

const MENU: CardMenuItem<DemoDocument>[] = [
  { label: 'Duplicate', icon: 'pi pi-copy', command: (doc) => (lastAction.value = `Duplicate ${doc.name}`) },
  { label: 'Export', icon: 'pi pi-download', command: (doc) => (lastAction.value = `Export ${doc.name}`) },
  { separator: true },
  {
    label: 'Publish',
    icon: 'pi pi-send',
    // Shown on drafts only: `state` is read here, hence in `extra-fields`.
    condition: (doc) => doc.state === 'draft',
    command: (doc) => (lastAction.value = `Publish ${doc.name}`),
  },
]

function open(doc: DemoDocument): void {
  lastAction.value = `Open ${doc.name}`
}
</script>

<template>
  <div class="card-demo">
    <div class="card-demo__controls">
      <SelectButton
        v-model="mode"
        :options="['display', 'selection']"
        :allow-empty="false"
        aria-label="Mode"
      />
      <label class="card-demo__switch">
        <ToggleSwitch v-model="failNext" />
        Fail the next request
      </label>
    </div>

    <!-- Keyed on the mode, like the list demo: a view is created in one mode. -->
    <CardView
      :key="mode"
      v-model:selection="selection"
      :fetch-page="fetchDocuments"
      :filters="filters"
      :mode="mode"
      :menu="MENU"
      :extra-fields="['state']"
      empty-text="No document matches."
      @click="open"
      @selection-rows="selectedNames = $event.map((doc) => doc.name)"
    >
      <template #header="{ loading, reload }">
        <MultiRecordFilters
          :fields="FILTER_FIELDS"
          :filters="filters"
          :active-filters="activeFilters"
          :loading="loading"
          search-placeholder="Search a name…"
          @apply="setFilters"
          @patch="updateFilters"
          @refresh="reload"
        />
      </template>

      <template #cover>
        <Field name="cover" widget="media_image" />
      </template>
      <template #title>
        <Field name="name" />
      </template>
      <template #subtitle>
        <Field name="author" widget="many2one" />
      </template>
      <template #content>
        <div class="card-demo__content">
          <Field name="summary" widget="text" :options="{ truncate: 90 }" />
          <Field name="pages" widget="integer" label="Pages" />
          <Field name="updated_at" widget="datetime" label="Updated" />
        </div>
      </template>
      <template #footer="{ data }">
        <Field name="tags" widget="many2many_tags" />
        <Tag v-if="data.state === 'published'" value="Published" severity="success" />
        <Button label="Preview" icon="pi pi-eye" size="small" text
                @click="lastAction = `Preview ${data.name}`" />
      </template>
    </CardView>

    <p v-if="mode === 'selection'" class="note">
      Selected ids: {{ selection.join(', ') || 'none' }}
      — labelled so far: {{ selectedNames.join(', ') || 'none' }}
    </p>
    <p v-else class="note">Last action: {{ lastAction ?? 'none' }}</p>

    <h3>The last query</h3>
    <pre class="preview">{{ lastQuery }}</pre>
  </div>
</template>

<style scoped>
.card-demo {
  display: grid;
  gap: 0.75rem;
}

.card-demo__controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.card-demo__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.card-demo__content {
  display: grid;
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

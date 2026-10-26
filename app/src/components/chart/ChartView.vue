<script setup lang="ts" generic="F extends ListFilters">
/*
 * A server-side chart, declared the way a <ListView> is: the view lists its
 * <Field type="dimension|measure">s, this draws the chart.
 *
 * What it adds over a bare <Chart>:
 *
 * - two ORDERED tag dropdowns, dimensions then measures. The order is the
 *   order of the keys in each label (`Rent / Sep 2026`) and of the series;
 *   PrimeVue's MultiSelect appends a pick at the end, which is what makes the
 *   click order the value's order -- hence no "select all", which would add
 *   them in declaration order instead;
 * - an "Order by" over the picked sortable fields, and a chart-type switcher;
 * - the choice kept per chart in localStorage, checked against the
 *   declarations on the way back (prefs.ts);
 * - the request: `POST .../group-by/` through useResourceGroups, with the
 *   same filters as the list, from the same query string.
 *
 * Like every view it knows no route and no resource: `fetchGroups` is a
 * callback, so a Dialog could mount it as is.
 *
 * chart.js is not imported here: primevue/chart loads it with a dynamic
 * import on first draw, so it lands in a chunk of its own and the login page
 * never pays for it.
 */
import Button from 'primevue/button'
import Chart from 'primevue/chart'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import { computed, onMounted, onScopeDispose, provide, ref, shallowReactive, watch } from 'vue'

import { MAX_DIMENSIONS } from '@/api/groupBy'
import type { ListFilters } from '@/api/list'
import FieldDeclarations from '@/components/list/FieldDeclarations.vue'
import { createDelayedFlag } from '@/components/list/delayedFlag'
import { useResourceGroups, type GroupFetcher } from '@/composables/useResourceGroups'
import { useTheme } from '@/composables/useTheme'

import { CHART_CONTEXT } from './context'
import type { ChartFieldDeclaration, ChartType } from './fields/types'
import {
  CHART_TYPES,
  chartPrefsKey,
  orderingOptions,
  parseChartPrefs,
  resolveChartPrefs,
  serialiseChartPrefs,
  type ChartPrefs,
} from './prefs'
import {
  buildChartData,
  CHART_COLOR_VARIABLES,
  hasNegativeValue,
  styleChartData,
  type ChartColors,
  type ChartData,
} from './series'

const props = withDefaults(
  defineProps<{
    fetchGroups: GroupFetcher<F>
    /** From useFilter. Any change reloads, debounced. */
    filters?: F
    /** Shown until the user picks otherwise. Undeclared names are dropped. */
    defaultDimensions: readonly string[]
    defaultMeasures: readonly string[]
    defaultType?: ChartType
    defaultOrdering?: string | null
    /** The types offered in the switcher, in this order. */
    allowedTypes?: readonly ChartType[]
    /** Where the choice is kept. Absent: not kept at all. */
    storageKey?: string
    /** Mirror the filters in the URL. ONLY a routed page sets it. */
    syncUrl?: boolean
    emptyText?: string
  }>(),
  {
    filters: undefined,
    defaultType: 'bar',
    defaultOrdering: null,
    allowedTypes: () => CHART_TYPES,
    storageKey: undefined,
    syncUrl: false,
    emptyText: 'Nothing to chart.',
  },
)

const emit = defineEmits<{
  /** Every settled response: the number of groups. */
  loaded: [total: number]
}>()

defineSlots<{
  /** The <Field> declarations. */
  default?(): unknown
  /** Above the controls: the filter bar, typically. */
  header?(scope: { loading: boolean; reload: () => Promise<void> }): unknown
  empty?(): unknown
}>()

// ------------------------------------------------------------------- fields

/** Filled in by the <Field>s of the default slot, in declaration order. */
const declared = shallowReactive(new Map<string, () => ChartFieldDeclaration>())

provide(CHART_CONTEXT, {
  register(name: string, field: () => ChartFieldDeclaration) {
    declared.set(name, field)
  },
  unregister(name: string) {
    declared.delete(name)
  },
})

const declarations = computed<ChartFieldDeclaration[]>(() =>
  [...declared.values()].map((read) => read()),
)

const byName = computed(() => new Map(declarations.value.map((field) => [field.name, field])))

/**
 * The dropdown entries, by label: a reader looks a field up by its name, and
 * `Date (Day)` ... `Date (Year)` then sit together. Only the OFFER is sorted --
 * the value keeps the click order, which is what the chart draws.
 */
function byLabel(kind: ChartFieldDeclaration['kind']): ChartFieldDeclaration[] {
  return declarations.value
    .filter((field) => field.kind === kind)
    .sort((a, b) => a.label.localeCompare(b.label))
}

const dimensionOptions = computed(() => byLabel('dimension'))
const measureOptions = computed(() => byLabel('measure'))

// -------------------------------------------------------------- preferences

function readStored(): ChartPrefs | null {
  if (!props.storageKey) return null
  // Private mode, a full quota, a sandboxed iframe: the chart must still work.
  try {
    return parseChartPrefs(localStorage.getItem(chartPrefsKey(props.storageKey)))
  } catch {
    return null
  }
}

const stored = ref<ChartPrefs | null>(readStored())

function defaults(): ChartPrefs {
  return {
    dimensions: [...props.defaultDimensions],
    measures: [...props.defaultMeasures],
    type: props.defaultType,
    ordering: props.defaultOrdering,
  }
}

/** Derived, not stored: checked against what the view declares TODAY. */
const prefs = computed<ChartPrefs>(() =>
  resolveChartPrefs(declarations.value, stored.value, defaults(), props.allowedTypes),
)

function update(patch: Partial<ChartPrefs>): void {
  const next = resolveChartPrefs(
    declarations.value,
    { ...prefs.value, ...patch },
    defaults(),
    props.allowedTypes,
  )
  stored.value = next
  if (!props.storageKey) return
  try {
    localStorage.setItem(chartPrefsKey(props.storageKey), serialiseChartPrefs(next))
  } catch {
    // Kept for this visit only: better than dropdowns that do nothing.
  }
}

/**
 * The last chip cannot be removed, like the last column of a list: the
 * backend refuses a group-by with no dimension or no measure, and falling back
 * to the default instead would put back a chip the user just took off.
 */
function setDimensions(names: string[] | null): void {
  if (names?.length) update({ dimensions: names })
}

function setMeasures(names: string[] | null): void {
  if (names?.length) update({ measures: names })
}

/** PrimeVue's Select reads a null value as "nothing picked": the default is ''. */
const orderings = computed(() =>
  orderingOptions(declarations.value, prefs.value).map((option) => ({
    ...option,
    value: option.value ?? '',
  })),
)

const TYPE_ICONS: Record<ChartType, { icon: string; label: string }> = {
  bar: { icon: 'pi pi-chart-bar', label: 'Bars' },
  line: { icon: 'pi pi-chart-line', label: 'Lines' },
  pie: { icon: 'pi pi-chart-pie', label: 'Pie' },
}

const typeOptions = computed(() =>
  props.allowedTypes.map((type) => ({ value: type, ...TYPE_ICONS[type] })),
)

// --------------------------------------------------------------------- data

const chart = useResourceGroups<F>({
  fetchGroups: props.fetchGroups,
  filters: props.filters,
  // NOT the type: a bar and a pie draw the same groups.
  selection: () => ({
    dimensions: prefs.value.dimensions,
    measures: prefs.value.measures,
    ordering: prefs.value.ordering,
  }),
  syncUrl: props.syncUrl,
  // The fields are only known once the <Field>s below have run their setup,
  // i.e. after this one: the first request leaves in onMounted.
  immediate: false,
})

const { groups, shown, total, loading, error, isInitialLoad } = chart

onMounted(() => {
  void chart.reload()
})

watch(loading, (busy) => {
  if (!busy && !error.value) emit('loaded', total.value)
})

/** Same delay as ListView's mask, and for the same reason: see delayedFlag.ts. */
const MASK_DELAY_MS = 300
const masked = ref(false)
const mask = createDelayedFlag(MASK_DELAY_MS, (on) => {
  masked.value = on
})
watch(loading, (busy) => mask.set(busy && !isInitialLoad.value))
onScopeDispose(() => mask.dispose())

/** Built from what the groups ANSWER, not from the dropdowns: see `shown`. */
const data = computed<ChartData>(() => {
  const answered = shown.value
  if (!answered) return { labels: [], datasets: [] }
  const pick = (names: readonly string[]): ChartFieldDeclaration[] =>
    names.flatMap((name) => byName.value.get(name) ?? [])
  return buildChartData(groups.value, pick(answered.dimensions), pick(answered.measures))
})

// ------------------------------------------------------------------- colours

const { theme } = useTheme()

/** Read from the theme's CSS variables, never hard-coded: see series.ts. */
function cssVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const colors = computed<ChartColors & { text: string; muted: string; grid: string }>(() => {
  // Read so the colours are re-resolved when the theme flips.
  void theme.value
  return {
    palette: CHART_COLOR_VARIABLES.map(cssVariable).filter(Boolean),
    surface: cssVariable('--app-panel'),
    text: cssVariable('--app-text'),
    muted: cssVariable('--app-muted'),
    grid: cssVariable('--app-border'),
  }
})

const styled = computed(() => styleChartData(data.value, prefs.value.type, colors.value))

const chartOptions = computed(() => {
  const { text, muted, grid } = colors.value
  const legend = { labels: { color: text } }
  if (prefs.value.type === 'pie') {
    return { maintainAspectRatio: false, plugins: { legend } }
  }
  const axis = { ticks: { color: muted }, grid: { color: grid } }
  return { maintainAspectRatio: false, plugins: { legend }, scales: { x: axis, y: axis } }
})

const negativePie = computed(() => prefs.value.type === 'pie' && hasNegativeValue(data.value))

const empty = computed(() => !isInitialLoad.value && !error.value && groups.value.length === 0)

defineExpose({ reload: chart.reload })
</script>

<template>
  <div class="chart-view">
    <!-- The declarations: mounted so they register, never shown. -->
    <div hidden><FieldDeclarations><slot /></FieldDeclarations></div>

    <slot name="header" :loading="loading" :reload="chart.reload" />

    <div class="chart-view__controls">
      <MultiSelect
        :model-value="prefs.dimensions"
        :options="dimensionOptions"
        option-label="label"
        option-value="name"
        display="chip"
        filter
        :show-toggle-all="false"
        :selection-limit="MAX_DIMENSIONS"
        placeholder="Group by"
        aria-label="Group by"
        class="chart-view__picker"
        @update:model-value="setDimensions"
      >
        <template #option="{ option }">
          <span :title="option.help">{{ option.label }}</span>
        </template>
      </MultiSelect>

      <MultiSelect
        :model-value="prefs.measures"
        :options="measureOptions"
        option-label="label"
        option-value="name"
        display="chip"
        filter
        :show-toggle-all="false"
        placeholder="Measures"
        aria-label="Measures"
        class="chart-view__picker"
        @update:model-value="setMeasures"
      >
        <template #option="{ option }">
          <span :title="option.help">{{ option.label }}</span>
        </template>
      </MultiSelect>

      <Select
        :model-value="prefs.ordering ?? ''"
        :options="orderings"
        option-label="label"
        option-value="value"
        placeholder="Default order"
        aria-label="Order by"
        class="chart-view__order"
        @update:model-value="update({ ordering: $event || null })"
      />

      <SelectButton
        v-if="typeOptions.length > 1"
        :model-value="prefs.type"
        :options="typeOptions"
        option-value="value"
        data-key="value"
        :allow-empty="false"
        aria-label="Chart type"
        @update:model-value="update({ type: $event })"
      >
        <template #option="{ option }">
          <i :class="option.icon" :title="option.label" :aria-label="option.label" />
        </template>
      </SelectButton>
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="chart-view__error">
        <span>{{ error }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="chart.reload" />
      </div>
    </Message>

    <Message v-if="total > groups.length" severity="warn" :closable="false">
      Showing the first {{ groups.length }} of {{ total }} groups: narrow the filters, or group by
      a coarser period.
    </Message>

    <Message v-if="negativePie" severity="info" :closable="false">
      A pie draws every slice by its size: a negative total looks like a positive one.
    </Message>

    <div v-if="!error" class="chart-view__body" :class="{ 'chart-view__body--masked': masked }">
      <Skeleton v-if="isInitialLoad" height="100%" />
      <div v-else-if="empty" class="chart-view__empty">
        <slot name="empty">
          <p>{{ emptyText }}</p>
        </slot>
      </div>
      <Chart
        v-else
        :type="prefs.type"
        :data="styled"
        :options="chartOptions"
        class="chart-view__chart"
      />
    </div>
  </div>
</template>

<style scoped>
/* The same panel as a <ListView>'s DataTable -- its background, border and
   radius, from the same PrimeVue tokens -- so a switch between the two views
   of a page does not change the surface under the user's eyes. */
.chart-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.75rem 1rem 1rem;
  background: var(--p-datatable-header-background, var(--p-content-background));
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}

.chart-view__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.chart-view__picker {
  flex: 1 1 14rem;
  min-width: 0;
}

.chart-view__order {
  flex: 0 1 13rem;
}

.chart-view__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

/* A fixed height: chart.js sizes itself on its container, and with
   `maintainAspectRatio: false` a container sized by its content never stops
   growing. */
.chart-view__body {
  position: relative;
  height: 24rem;
  transition: opacity 0.15s;
}

.chart-view__body--masked {
  opacity: 0.5;
}

.chart-view__chart {
  height: 100%;
}

.chart-view__empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--app-muted);
}
</style>

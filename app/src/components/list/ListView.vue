<script setup lang="ts" generic="R extends ListRow, F extends ListFilters">
/*
 * A server-side list, declared the way a <Form> is: the view lists its
 * <Field>s, this draws the table.
 *
 * What every XxxListView used to copy by hand lives here once -- the lazy
 * DataTable wired to useResourceList, the skeleton rows, the error banner and
 * its Retry, the empty block -- plus what none of them had:
 *
 * - the COLUMN MENU: the user ticks and orders the columns (the cog), the
 *   choice is kept per list in localStorage, and `?fields=` asks for what is
 *   shown and nothing else;
 * - ROW REORDERING, when the caller hands a `resequence` route;
 * - a SELECTION mode, checkboxes kept across pages, whose ids come back
 *   through `v-model:selection` -- the building block of a many-to-many picker
 *   in a Dialog.
 *
 * Like every view, it knows no route and no resource: `fetchPage` and
 * `resequence` are callbacks, so the layering rule holds and a Dialog can
 * mount it as is.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Tooltip from 'primevue/tooltip'
import {
  computed,
  onMounted,
  onScopeDispose,
  provide,
  ref,
  shallowReactive,
  shallowRef,
  watch,
} from 'vue'

import { ApiError } from '@/api/client'
import { MAX_PAGE_SIZE, type ListFilters } from '@/api/list'
import { useResourceList, type ListFetcher } from '@/composables/useResourceList'

import ColumnMenu from './ColumnMenu.vue'
import FieldDeclarations from './FieldDeclarations.vue'
import {
  columnPrefsKey,
  moveColumn,
  parseColumnPrefs,
  requestedFields,
  resolveColumns,
  serialiseColumnPrefs,
  toggleColumn,
  type ColumnPrefs,
  type ColumnState,
} from './columns'
import { LIST_CONTEXT, type ListColumn } from './context'
import { createDelayedFlag } from './delayedFlag'
import Cell from './fields/Cell.vue'
import type { ListRow } from './fields/types'
import { createResequenceQueue } from './resequence'
import {
  applyPageSelection,
  pageSelection,
  selectedIds,
  selectedRows,
  selectionFromIds,
  type Selection,
} from './selection'

/** Local, not app-wide: one screen using a tooltip does not justify a global directive. */
const vTooltip = Tooltip

const props = withDefaults(
  defineProps<{
    fetchPage: ListFetcher<R, F>
    /** From useFilter. Any change returns to page 1. */
    filters?: F
    /** The initial sort; the backend's own default ordering, ideally. */
    sortField?: string | null
    sortOrder?: 1 | -1
    /** What the backend accepts in `?ordering=`. A <Field sortable> outside it
        is not made sortable: its header would send a 422. */
    sortable?: readonly string[]
    pageSize?: number
    /** `compact` is the one-line pager of a list inside a Dialog. */
    paginator?: 'full' | 'compact' | 'none'
    /** Mirror page, sort and filters in the URL. ONLY a routed page sets it,
        and never in selection mode: a Dialog does not own the host's URL. */
    syncUrl?: boolean
    mode?: 'display' | 'selection'
    /** The selected ids, selection mode only. */
    selection?: readonly (string | number)[]
    /** Where the column choice is kept. Absent: not kept at all. */
    storageKey?: string
    /**
     * Saves a new row order: enables the drag handle. The list then holds
     * every row on one page, in `sequenceField` order, with no header sort --
     * a drag only means something in that order, and the route numbers only
     * the ids it is given.
     */
    resequence?: (ids: string[]) => Promise<unknown>
    sequenceField?: string
    /**
     * Keys asked for whatever the columns: what the view itself reads from a
     * row -- the name a Delete confirmation quotes, say. Without them, hiding
     * that column in the cog would quietly blank the sentence.
     */
    extraFields?: readonly string[]
    emptyText?: string
    /** A denser table, for a list inside a Dialog. */
    size?: 'small'
  }>(),
  {
    filters: undefined,
    sortField: null,
    sortOrder: 1,
    sortable: undefined,
    pageSize: 10,
    paginator: 'full',
    syncUrl: false,
    mode: 'display',
    selection: () => [],
    storageKey: undefined,
    resequence: undefined,
    sequenceField: 'sequence',
    extraFields: () => [],
    emptyText: 'No record yet.',
    size: undefined,
  },
)

const emit = defineEmits<{
  /** Every settled response, so a page header can show the count. */
  loaded: [total: number]
  'update:selection': [ids: string[]]
  /** The selected rows seen so far: what labels the chips of a many2many. */
  'selection-rows': [rows: R[]]
}>()

defineSlots<{
  /** The <Field> declarations. */
  default?(): unknown
  /** Above the table: the filter bar, typically. */
  header?(scope: { loading: boolean; reload: () => Promise<void> }): unknown
  /** The buttons of a row, in the last column. Display mode only. */
  actions?(scope: { row: R }): unknown
  empty?(): unknown
}>()

// ------------------------------------------------------------------ columns

/** Filled in by the <Field>s of the default slot, in declaration order. */
const declared = shallowReactive(new Map<string, () => ListColumn>())

provide(LIST_CONTEXT, {
  register(name: string, column: () => ListColumn) {
    declared.set(name, column)
  },
  unregister(name: string) {
    declared.delete(name)
  },
})

const declarations = computed<ListColumn[]>(() => [...declared.values()].map((read) => read()))

function readPrefs(): ColumnPrefs | null {
  if (!props.storageKey) return null
  // Private mode, a full quota, a sandboxed iframe: the table must still work.
  try {
    return parseColumnPrefs(localStorage.getItem(columnPrefsKey(props.storageKey)))
  } catch {
    return null
  }
}

const prefs = ref<ColumnPrefs | null>(readPrefs())

/** Derived, not stored: a <Field> appearing later still finds its place. */
const columnState = computed<ColumnState[]>(() => resolveColumns(declarations.value, prefs.value))

function savePrefs(state: ColumnState[] | null): void {
  prefs.value = state ? parseColumnPrefs(serialiseColumnPrefs(state)) : null
  if (!props.storageKey) return
  try {
    const key = columnPrefsKey(props.storageKey)
    if (state) localStorage.setItem(key, serialiseColumnPrefs(state))
    else localStorage.removeItem(key)
  } catch {
    // Kept for this visit only: better than a column menu that does nothing.
  }
}

const visibleColumns = computed<ListColumn[]>(() => {
  const byName = new Map(declarations.value.map((column) => [column.name, column]))
  return columnState.value
    .filter((state) => state.visible)
    .map((state) => byName.get(state.name)!)
})

const columnMenu = ref<InstanceType<typeof ColumnMenu> | null>(null)

const menuColumns = computed(() => {
  const byName = new Map(declarations.value.map((column) => [column.name, column]))
  return columnState.value.map((state) => ({
    name: state.name,
    label: byName.get(state.name)!.label,
    visible: state.visible,
  }))
})

// --------------------------------------------------------------------- data

const orderable = computed(() => Boolean(props.resequence) && props.mode === 'display')

const list = useResourceList<R, F>({
  fetchPage: props.fetchPage,
  filters: props.filters,
  // EVERY row when orderable: the new order has to be sent whole.
  pageSize: props.resequence ? MAX_PAGE_SIZE : props.pageSize,
  sortField: props.resequence ? props.sequenceField : props.sortField,
  sortOrder: props.sortOrder,
  sortable: props.sortable,
  syncUrl: props.syncUrl && props.mode === 'display',
  fields: () =>
    requestedFields(declarations.value, columnState.value, [
      ...props.extraFields,
      ...(props.resequence ? [props.sequenceField] : []),
    ]),
  // The columns are only known once the <Field>s below have run their setup,
  // i.e. after this one: the first request leaves in onMounted.
  immediate: false,
})

const { rows, total, loading, error, first, pageSize, sortField, sortOrder, isInitialLoad } = list

onMounted(() => {
  void list.reload()
})

/** Placeholder rows so the first paint has the table's real height. */
const skeletonRows = Array.from({ length: 5 }, (_, i) => ({ id: `skeleton-${i}` }) as R)

// On `loading` going false rather than on `total`: a reload landing on the same
// count must still be reported.
watch(loading, (busy) => {
  if (!busy && !error.value) emit('loaded', total.value)
})

/**
 * The table's loading mask, shown only for a request still running after
 * MASK_DELAY_MS -- see delayedFlag.ts for why not at once. The first load is
 * left out: the skeleton rows already say it.
 */
const MASK_DELAY_MS = 300
const masked = ref(false)
const mask = createDelayedFlag(MASK_DELAY_MS, (on) => {
  masked.value = on
})
watch(loading, (busy) => mask.set(busy && !isInitialLoad.value))
onScopeDispose(() => mask.dispose())

/** A header is sortable only when asked AND accepted -- and never while the
    rows ARE the sequence order. */
function isSortable(column: ListColumn): boolean {
  if (!column.sortable || orderable.value) return false
  return !props.sortable || props.sortable.includes(column.name)
}

if (import.meta.env.DEV) {
  watch(declarations, (columns) => {
    for (const column of columns) {
      if (column.sortable && props.sortable && !props.sortable.includes(column.name)) {
        console.warn(
          `<Field name="${column.name}" sortable>: not in the list's \`sortable\`, left unsortable.`,
        )
      }
    }
  })
}

// --------------------------------------------------------------- reordering

/**
 * The handle is offered only when a drop can be saved: every row on screen,
 * since past one page the order could not be sent whole, and a partial one
 * collides with the sequences it skips.
 */
const reorderable = computed(() => orderable.value && total.value <= pageSize.value)

/** The order just dropped, shown until the next load carries the server's. */
const ordered = shallowRef<R[] | null>(null)
watch(rows, () => {
  ordered.value = null
})

const reorderError = ref<string | null>(null)

const resequenceQueue = createResequenceQueue((ids) => props.resequence!(ids), {
  onError(caught: unknown) {
    reorderError.value =
      caught instanceof ApiError ? caught.message : 'The new order could not be saved.'
  },
  onIdle() {
    void list.reload()
  },
})

function onRowReorder(event: { value: R[] }): void {
  ordered.value = event.value
  reorderError.value = null
  resequenceQueue.push(event.value.map((row) => String(row.id)))
}

// ---------------------------------------------------------------- selection

const selected = shallowRef<Selection<R>>(new Map())

// The caller's ids are the truth; rows already seen are kept to label them.
watch(
  () => props.selection,
  (ids) => {
    const mine = selectedIds(selected.value)
    if (ids.length === mine.length && ids.every((id, i) => String(id) === mine[i])) return
    selected.value = selectionFromIds(selected.value, ids)
  },
  { immediate: true },
)

const displayed = computed<R[]>(() => (isInitialLoad.value ? skeletonRows : (ordered.value ?? rows.value)))

const pageSelected = computed<R[]>(() => pageSelection(selected.value, rows.value))

function onSelectionChange(checked: R[] | R | null): void {
  const checkedRows = Array.isArray(checked) ? checked : checked ? [checked] : []
  selected.value = applyPageSelection(selected.value, rows.value, checkedRows)
  emit('update:selection', selectedIds(selected.value))
  emit('selection-rows', selectedRows(selected.value))
}

// ---------------------------------------------------------------- paginator

const showPaginator = computed(() => {
  if (props.paginator === 'none') return false
  // One page of everything -- always the case when reorderable -- leaves a
  // compact pager nowhere to go. The full one stays: it carries the page size.
  if (props.paginator === 'compact' || props.resequence) return total.value > pageSize.value
  return true
})

const paginatorTemplate = computed(() =>
  props.paginator === 'compact'
    ? 'PrevPageLink CurrentPageReport NextPageLink'
    : 'FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown',
)

defineExpose({ reload: list.reload, reset: list.reset })
</script>

<template>
  <div class="list-view">
    <!-- The declarations: mounted so they register, never shown. Through
         FieldDeclarations, never inline: see that file. -->
    <div hidden><FieldDeclarations><slot /></FieldDeclarations></div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="list-view__error">
        <span>{{ error }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="list.reload" />
      </div>
    </Message>

    <Message v-if="reorderError" severity="error" :closable="false">{{ reorderError }}</Message>

    <DataTable
      lazy
      row-hover
      data-key="id"
      removable-sort
      :size="size"
      :value="displayed"
      :loading="masked"
      :paginator="showPaginator"
      :total-records="total"
      :first="first"
      :rows="pageSize"
      :rows-per-page-options="paginator === 'full' ? [10, 20, 50, 100] : undefined"
      :sort-field="sortField ?? undefined"
      :sort-order="sortOrder"
      :paginator-template="paginatorTemplate"
      current-page-report-template="{first}–{last} of {totalRecords}"
      :selection="mode === 'selection' ? pageSelected : undefined"
      @update:selection="onSelectionChange"
      @page="list.onPage"
      @sort="list.onSort"
      @row-reorder="onRowReorder"
    >
      <template v-if="$slots.header" #header>
        <slot name="header" :loading="loading" :reload="list.reload" />
      </template>

      <template #empty>
        <slot name="empty">
          <p class="list-view__empty">{{ emptyText }}</p>
        </slot>
      </template>

      <!-- Every column carries a `column-key`: PrimeVue keys its cells by
           `columnKey || field || index`, so a keyless column would be
           REMOUNTED whenever a column is ticked in before it -- closing the
           cog's menu under the user's click. -->
      <Column
        v-if="mode === 'selection'"
        column-key="__selection"
        selection-mode="multiple"
        style="width: 3rem"
      />

      <Column v-if="reorderable" column-key="__reorder" row-reorder style="width: 2.5rem" />

      <Column
        v-for="column in visibleColumns"
        :key="column.name"
        :column-key="column.name"
        :field="column.name"
        :sortable="isSortable(column)"
        :style="column.width ? { width: `${column.width}%` } : undefined"
        :header-class="column.align === 'end' ? 'list-view__header--end' : undefined"
      >
        <template #header>
          <span class="list-view__label">
            {{ column.label }}
            <i
              v-if="column.help"
              v-tooltip.top="column.help"
              class="pi pi-info-circle list-view__help"
              :aria-label="column.help"
            />
          </span>
        </template>
        <template #body="{ data }">
          <Cell :column="column" :row="data" :loading="isInitialLoad" />
        </template>
      </Column>

      <!-- Last column: the row's buttons, and the cog above them. -->
      <Column
        column-key="__actions"
        style="width: 1%"
        body-class="list-view__actions"
        header-class="list-view__actions"
      >
        <template #header>
          <Button
            v-if="declarations.length > 1"
            icon="pi pi-cog"
            text
            rounded
            size="small"
            severity="secondary"
            aria-label="Choose the columns"
            aria-haspopup="true"
            @click="columnMenu?.toggle($event)"
          />
        </template>
        <template #body="{ data }">
          <div v-if="mode === 'display' && !isInitialLoad" class="list-view__buttons">
            <slot name="actions" :row="data" />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Outside the table, on purpose: see ColumnMenu. -->
    <ColumnMenu
      ref="columnMenu"
      :columns="menuColumns"
      @toggle="savePrefs(toggleColumn(columnState, $event))"
      @move="(from, to) => savePrefs(moveColumn(columnState, from, to))"
      @reset="savePrefs(null)"
    />
  </div>
</template>

<style scoped>
.list-view {
  display: grid;
  /* minmax(0, ...) and not the implicit `auto` track: a grid item is as wide
     as its content by default, so a table of many columns would push out of
     its card instead of scrolling inside it. */
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
}

.list-view__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.list-view__empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-muted);
}

.list-view__label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.list-view__help {
  font-size: 0.8rem;
  color: var(--app-muted);
}

.list-view__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
  white-space: nowrap;
}

:deep(.list-view__actions) {
  text-align: right;
}

:deep(.list-view__actions .p-datatable-column-header-content) {
  justify-content: flex-end;
}

:deep(.list-view__header--end .p-datatable-column-header-content) {
  justify-content: flex-end;
}
</style>

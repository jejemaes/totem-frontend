<script setup lang="ts" generic="R extends ListRow, F extends ListFilters">
/*
 * A server-side list drawn as a grid of PrimeVue <Card>s: <ListView>'s
 * counterpart for records better read than scanned -- a document, a page, a
 * kiosk with a picture.
 *
 * The view fills the card's slots (`#cover`, `#title`, `#subtitle`,
 * `#content`, `#footer`), each handed `{ data }`, with card <Field>s and
 * markup of its own. Around them this draws what every card list needs: the
 * request through useResourceList -- so the filters, the URL and the race
 * handling are the list's own --, the skeleton cards, the error banner and its
 * Retry, the empty block, the pager, and three optional behaviours:
 *
 * - `menu`: a "⋮" in the top-right corner of each card, one popup <Menu>
 *   shared by them all, built per record from record actions
 *   (actions/actions.ts) and run through `useActionRunner`, the page being
 *   reloaded after an action that stored something (`reload`, or a record
 *   answered);
 * - `@click`: the whole card opens the record -- but not a click on one of
 *   its buttons, links or checkbox (`isInteractiveTarget`);
 * - `mode="selection"`: a checkbox per card, kept across pages by
 *   list/selection.ts, ids out through `v-model:selection` -- the contract of
 *   ListView's own selection mode, so a caller can switch between the two.
 *
 * HOW `?fields=` IS KNOWN. A card <Field> renders inside a per-record slot, so
 * it only exists once there is a record -- and the request needs its key
 * before. The first render therefore draws SKELETON cards from placeholder
 * records: every <Field> mounts there, declares its keys, and draws a
 * placeholder; the first request leaves in onMounted, after them. The set is
 * then frozen: fields mount and unmount card by card, and a set following them
 * would reload the page under the user. A <Field> the placeholders did not
 * reach -- behind a `v-if` on the record -- and any key a slot reads itself
 * belong in `extra-fields`; in dev, the former warns.
 *
 * Like every view, it knows no route and no resource: `fetchPage` is a
 * callback, so the layering rule holds and a Dialog can mount it as is.
 */
import Button from 'primevue/button'
import Card from 'primevue/card'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'
import Message from 'primevue/message'
import Paginator from 'primevue/paginator'
import { computed, onMounted, onScopeDispose, provide, ref, shallowRef, watch } from 'vue'

import type { ListFilters } from '@/api/list'
import { can } from '@/auth/permissions'
import type { ActionEntry, RecordAction } from '@/components/actions/actions'
import { createDelayedFlag } from '@/components/list/delayedFlag'
import type { ListRow } from '@/components/list/fields/types'
import {
  applyPageSelection,
  pageSelection,
  rowKey,
  selectedIds,
  selectedRows,
  selectionFromIds,
  type Selection,
} from '@/components/list/selection'
import { useActionRunner } from '@/composables/useActionRunner'
import { usePublishedRecordSet } from '@/composables/usePublishedRecordSet'
import { useResourceList, type ListFetcher } from '@/composables/useResourceList'

import CardControls from './CardControls.vue'
import CardRecord from './CardRecord.vue'
import {
  cardMenuItems,
  isInteractiveTarget,
  paginatorTemplate,
  requestedCardFields,
  showPaginator,
  type CardPaginator,
} from './cardView'
import { CARD_CONTEXT } from './context'

const props = withDefaults(
  defineProps<{
    fetchPage: ListFetcher<R, F>
    /** From useFilter. Any change returns to page 1. */
    filters?: F
    /** The sort -- fixed: a card grid has no header to click. */
    sortField?: string | null
    sortOrder?: 1 | -1
    /** What the backend accepts in `?ordering=`: a stale URL is checked against it. */
    sortable?: readonly string[]
    /** 12 by default: a full grid at 2, 3 and 4 cards a row. */
    pageSize?: number
    /** `compact` is the one-line pager of cards inside a Dialog. */
    paginator?: CardPaginator
    /** Mirror page and filters in the URL. ONLY a routed page sets it, and
        never in selection mode: a Dialog does not own the host's URL. */
    syncUrl?: boolean
    mode?: 'display' | 'selection'
    /** The selected ids, selection mode only. */
    selection?: readonly (string | number)[]
    /** The "⋮" menu of each card. Absent or empty: no button at all. */
    menu?: readonly ActionEntry<R>[]
    /**
     * Keys asked for whatever the <Field>s: what the slots read themselves (a
     * `v-if="data.state === 'done'"`), and the keys of a <Field> behind such a
     * `v-if` -- the skeleton cards never mount it, so it never declares them.
     */
    extraFields?: readonly string[]
    emptyText?: string
    /**
     * Opens a record: the whole card becomes a button. A prop rather than an
     * emit so the caller still writes `@click`, AND CardView knows whether one
     * was given -- a card with nowhere to go must not look clickable.
     */
    onClick?: (record: R) => void
  }>(),
  {
    filters: undefined,
    sortField: null,
    sortOrder: 1,
    sortable: undefined,
    pageSize: 12,
    paginator: 'full',
    syncUrl: false,
    mode: 'display',
    selection: () => [],
    menu: () => [],
    extraFields: () => [],
    emptyText: 'No record yet.',
    onClick: undefined,
  },
)

const emit = defineEmits<{
  /** Every settled response, so a page header can show the count. */
  loaded: [total: number]
  'update:selection': [ids: string[]]
  /** The selected records seen so far: what labels the chips of a many2many. */
  'selection-rows': [rows: R[]]
}>()

defineSlots<{
  /** Above the grid: the filter bar, typically. */
  header?(scope: { loading: boolean; reload: () => Promise<void> }): unknown
  /** The top of the card, edge to edge: an image. PrimeVue's own `header`. */
  cover?(scope: { data: R }): unknown
  title?(scope: { data: R }): unknown
  subtitle?(scope: { data: R }): unknown
  content?(scope: { data: R }): unknown
  footer?(scope: { data: R }): unknown
  empty?(): unknown
}>()

// ----------------------------------------------------------------- fields

/** What the skeleton cards' <Field>s declared. A plain Set: read once. */
const declared = new Set<string>()
/** What the requests carry, frozen on mount. */
const requested = shallowRef<ReadonlySet<string>>(new Set(['id']))
const warned = new Set<string>()

provide(CARD_CONTEXT, {
  register(keys: readonly string[]) {
    for (const key of keys) declared.add(key)
  },
  check(keys: readonly string[]) {
    if (!import.meta.env.DEV) return
    for (const key of keys) {
      if (requested.value.has(key) || warned.has(key)) continue
      warned.add(key)
      console.warn(
        `<CardView>: a <Field> reads "${key}", which the request did not carry. ` +
          'A <Field> behind a `v-if` must have its keys in `extra-fields`.',
      )
    }
  },
})

// --------------------------------------------------------------------- data

const selecting = computed(() => props.mode === 'selection')

const list = useResourceList<R, F>({
  fetchPage: props.fetchPage,
  filters: props.filters,
  pageSize: props.pageSize,
  sortField: props.sortField,
  sortOrder: props.sortOrder,
  sortable: props.sortable,
  syncUrl: props.syncUrl && !selecting.value,
  fields: () => [...requested.value],
  // The <Field>s declare during the first render, after this setup.
  immediate: false,
})

const { rows, total, loading, error, first, pageSize, isInitialLoad } = list

onMounted(() => {
  requested.value = new Set(requestedCardFields(declared, props.extraFields))
  void list.reload()
})

/** Placeholder records: what the <Field>s mount on to declare, and the first
    paint at the grid's real height. */
const skeletonRecords = Array.from({ length: 6 }, (_, i) => ({ id: `skeleton-${i}` }) as R)

const displayed = computed<R[]>(() => (isInitialLoad.value ? skeletonRecords : rows.value))

// What a form opened from here walks with its previous / next buttons.
usePublishedRecordSet(props.syncUrl && !selecting.value, () =>
  isInitialLoad.value ? null : rows.value.map((record) => String(record.id)),
)

// On `loading` going false rather than on `total`: a reload landing on the same
// count must still be reported.
watch(loading, (busy) => {
  if (!busy && !error.value) emit('loaded', total.value)
})

/** The grid's dimming, only for a request still running after 300 ms -- the
    reason is in delayedFlag.ts. The first load has its skeleton cards. */
const masked = ref(false)
const mask = createDelayedFlag(300, (on) => {
  masked.value = on
})
watch(loading, (busy) => mask.set(busy && !isInitialLoad.value))
onScopeDispose(() => mask.dispose())

const pagerShown = computed(() => showPaginator(props.paginator, total.value, pageSize.value))

// ---------------------------------------------------------------- selection

const selected = shallowRef<Selection<R>>(new Map())

// The caller's ids are the truth; records already seen are kept to label them.
watch(
  () => props.selection,
  (ids) => {
    const mine = selectedIds(selected.value)
    if (ids.length === mine.length && ids.every((id, i) => String(id) === mine[i])) return
    selected.value = selectionFromIds(selected.value, ids)
  },
  { immediate: true },
)

function isSelected(record: R): boolean {
  return selected.value.has(rowKey(record))
}

function toggleSelected(record: R): void {
  const onPage = pageSelection(selected.value, rows.value)
  const checked = isSelected(record)
    ? onPage.filter((row) => rowKey(row) !== rowKey(record))
    : [...onPage, record]
  selected.value = applyPageSelection(selected.value, rows.value, checked)
  emit('update:selection', selectedIds(selected.value))
  emit('selection-rows', selectedRows(selected.value))
}

// ------------------------------------------------------------- click, menu

/** A card is a button when a click does something: open, or select. */
const clickable = computed(() => selecting.value || Boolean(props.onClick))

function activate(record: R, event: Event): void {
  if (isInitialLoad.value || isInteractiveTarget(event.target, event.currentTarget)) return
  if (selecting.value) toggleSelected(record)
  else props.onClick?.(record)
}

function onKeydown(record: R, event: KeyboardEvent): void {
  // Only the card itself: Enter on a footer button is that button's.
  if (event.target !== event.currentTarget) return
  event.preventDefault()
  activate(record, event)
}

const runner = useActionRunner()
const actionError = runner.error

/** A card has no form to re-seed: an answered record means a reload too. */
async function runAction(action: RecordAction<R>, record: R): Promise<void> {
  const outcome = await runner.execute(action, [record])
  if (outcome.status === 'done' && (action.reload || outcome.result)) void list.reload()
}

const menuRef = ref<InstanceType<typeof Menu> | null>(null)
const menuItems = shallowRef<MenuItem[]>([])

/** Each record's entries, computed once per render rather than per open: a
    card whose every entry is hidden must not show a "⋮" opening on nothing. */
const menus = computed(() => {
  const byId = new Map<string, MenuItem[]>()
  if (!props.menu.length || isInitialLoad.value) return byId
  for (const record of rows.value) byId.set(rowKey(record), cardMenuItems(props.menu, record, can, runAction))
  return byId
})

function openMenu(record: R, event: Event): void {
  menuItems.value = menus.value.get(rowKey(record)) ?? []
  menuRef.value?.toggle(event)
}

defineExpose({ reload: list.reload, reset: list.reset })
</script>

<template>
  <div class="card-view">
    <slot name="header" :loading="loading" :reload="list.reload" />

    <Message v-if="error" severity="error" :closable="false">
      <div class="card-view__error">
        <span>{{ error }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="list.reload" />
      </div>
    </Message>

    <!-- A refused menu action: closable, the cards behind it are still valid. -->
    <Message v-if="actionError" severity="error" closable @close="actionError = null">
      {{ actionError }}
    </Message>

    <div v-if="displayed.length" class="card-view__grid" :class="{ 'card-view__grid--masked': masked }"
         :aria-busy="loading">
      <CardRecord
        v-for="record in displayed"
        :key="record.id"
        :record="record"
        :loading="isInitialLoad"
      >
        <Card
          class="card-view__card"
          :class="{
            'card-view__card--clickable': clickable && !isInitialLoad,
            'card-view__card--selected': selecting && isSelected(record),
          }"
          :role="clickable && !isInitialLoad ? 'button' : undefined"
          :tabindex="clickable && !isInitialLoad ? 0 : undefined"
          :aria-pressed="selecting && !isInitialLoad ? isSelected(record) : undefined"
          @click="activate(record, $event)"
          @keydown.enter="onKeydown(record, $event)"
          @keydown.space="onKeydown(record, $event)"
        >
          <!-- The checkbox and the "⋮" go over the cover when there is one, around
               the title otherwise: see CardControls. -->
          <template v-if="$slots.cover" #header>
            <div class="card-view__cover">
              <slot name="cover" :data="record" />
              <CardControls
                overlay
                :selectable="selecting && !isInitialLoad"
                :selected="isSelected(record)"
                :menu="Boolean(menus.get(rowKey(record))?.length)"
                @toggle="toggleSelected(record)"
                @menu="openMenu(record, $event)"
              />
            </div>
          </template>
          <template #title>
            <slot v-if="$slots.cover" name="title" :data="record" />
            <CardControls
              v-else
              :selectable="selecting && !isInitialLoad"
              :selected="isSelected(record)"
              :menu="Boolean(menus.get(rowKey(record))?.length)"
              @toggle="toggleSelected(record)"
              @menu="openMenu(record, $event)"
            >
              <slot name="title" :data="record" />
            </CardControls>
          </template>
          <template v-if="$slots.subtitle" #subtitle>
            <slot name="subtitle" :data="record" />
          </template>
          <template v-if="$slots.content" #content>
            <slot name="content" :data="record" />
          </template>
          <template v-if="$slots.footer" #footer>
            <div class="card-view__footer"><slot name="footer" :data="record" /></div>
          </template>
        </Card>
      </CardRecord>
    </div>

    <div v-else-if="!loading && !error">
      <slot name="empty">
        <p class="card-view__empty">{{ emptyText }}</p>
      </slot>
    </div>

    <Paginator
      v-if="pagerShown && !isInitialLoad && total > 0"
      :first="first"
      :rows="pageSize"
      :total-records="total"
      :rows-per-page-options="paginator === 'full' ? [12, 24, 48, 96] : undefined"
      :template="paginatorTemplate(paginator)"
      current-page-report-template="{first}–{last} of {totalRecords}"
      @page="list.onPage"
    />

    <!-- ONE popup for every card, filled on open: a Menu per card would mount
         a dozen overlays nobody opens. -->
    <Menu v-if="menu.length" ref="menuRef" :model="menuItems" popup />
  </div>
</template>

<style scoped>
.card-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.card-view__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.card-view__grid {
  display: grid;
  /* min(18rem, 100%): at phone width one card fills the row instead of
     pushing the page sideways. */
  grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
  gap: 1rem;
  transition: opacity 0.15s;
}

.card-view__grid--masked {
  opacity: 0.55;
}

.card-view__card {
  overflow: hidden;
  border: 1px solid var(--app-border);
  box-shadow: none;
}

.card-view__card--clickable {
  cursor: pointer;
  transition: border-color 0.15s;
}

.card-view__card--clickable:hover {
  border-color: var(--p-primary-color);
}

.card-view__card--clickable:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.card-view__card--selected {
  border-color: var(--p-primary-color);
  box-shadow: inset 0 0 0 1px var(--p-primary-color);
}

/* The positioning context of the controls laid over the cover. */
.card-view__cover {
  position: relative;
}

.card-view__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.card-view__empty {
  margin: 0;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--app-muted);
}
</style>

<script setup lang="ts">
/*
 * The lines of ONE budget position: the list the Balance tab of the budget
 * form opens in a Dialog.
 *
 * Deliberately smaller than a list screen: no filter bar (a position holds a
 * handful of lines) and NEVER `syncUrl` -- it lives inside a Dialog, over a
 * page whose query string is not its own. The position is a prop forced into every
 * request, like the account of the movements list.
 *
 * Adding and editing open BudgetLineFormView in a Dialog: the form is the same
 * router-free view a page would mount, which is what the pages/ views/ split
 * was made for. Every write is reported as `changed`, because a line's amount
 * feeds the stored totals of its position and of the budget, which the host
 * shows and must refetch.
 *
 * `orderable` (off by default, set by the Balance tab's Dialog) adds a drag
 * handle: every drop sends the position's WHOLE new order to the backend's
 * resequence route. In that mode the list is one page holding every line, in
 * sequence order with no header sort -- a drag only means something in that
 * order, and the route numbers only the ids it is given.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { computed, ref, shallowRef, watch } from 'vue'

import { ApiError } from '@/api/client'
import { MAX_PAGE_SIZE, type ListQuery, type Page } from '@/api/list'
import { can } from '@/auth/permissions'
import DeleteButton from '@/components/list/DeleteButton.vue'
import { useResourceList } from '@/composables/useResourceList'
import { formatAmount } from '@/resources/accounts'
import {
  BUDGET_LINE_SORTABLE,
  deleteBudgetLine,
  listBudgetLines,
  resequenceBudgetLines,
  type BudgetLineFilters,
  type BudgetLineRow,
} from '@/resources/budgetLines'

import BudgetLineFormView from './BudgetLineFormView.vue'

const props = withDefaults(
  defineProps<{
    budgetId: string
    /** The position whose lines are listed. Fixed for the life of the view. */
    positionId: string
    pageSize?: number
    /** Drag-and-drop reordering, saved on every drop. Off by default. */
    orderable?: boolean
  }>(),
  { pageSize: 10, orderable: false },
)

const emit = defineEmits<{
  /** A line was added, edited or deleted: the totals the host shows are stale. */
  changed: []
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canCreate = computed(() => can('totem.budget.create'))
const canUpdate = computed(() => can('totem.budget.update'))
const canDelete = computed(() => can('totem.budget.delete'))

/** The fetcher with the budget and the position forced in. */
function fetchPage(
  query: ListQuery<BudgetLineFilters>,
  signal: AbortSignal,
): Promise<Page<BudgetLineRow>> {
  return listBudgetLines(
    props.budgetId,
    { ...query, filters: { ...query.filters, position: props.positionId } },
    signal,
  )
}

const { rows, total, loading, error, first, pageSize, sortField, sortOrder, onPage, onSort, reload } =
  useResourceList({
    fetchPage,
    // EVERY line when orderable: the new order has to be sent whole.
    pageSize: props.orderable ? MAX_PAGE_SIZE : props.pageSize,
    sortField: 'sequence',
    sortable: BUDGET_LINE_SORTABLE,
  })

// ---------------------------------------------------------------- reordering

/**
 * The handle is offered only when a drop can be saved: the scope resequence
 * requires, and every line on screen -- past one page the order could not be
 * sent whole, and a partial one collides with the sequences it skips.
 */
const reorderable = computed(
  () => props.orderable && canUpdate.value && total.value <= pageSize.value,
)

/**
 * The order the user just dropped, shown until the next load lands. Local
 * because `rows` belongs to useResourceList; cleared by that load, which then
 * carries the server's numbering.
 */
const ordered = shallowRef<BudgetLineRow[] | null>(null)
watch(rows, () => {
  ordered.value = null
})

const reorderError = ref<string | null>(null)

/*
 * Drops are CHAINED, not fired in parallel: each request carries the full
 * order of its moment, so they must reach the server in drop order -- an older
 * order landing last would silently undo the newer one, the read-side race the
 * ticket idiom guards against, on a write. The list reloads once the chain is
 * idle, so a quick succession of drops is not interrupted by reloads.
 */
let queue: Promise<void> = Promise.resolve()
let queued = 0

function onRowReorder(event: { value: BudgetLineRow[] }): void {
  ordered.value = event.value
  const ids = event.value.map((row) => row.id)
  reorderError.value = null
  queued += 1

  queue = queue
    .then(() => resequenceBudgetLines(props.budgetId, ids))
    .catch((caught: unknown) => {
      reorderError.value =
        caught instanceof ApiError ? caught.message : 'The new order could not be saved.'
    })
    .finally(() => {
      queued -= 1
      // On failure too: the reload is what puts the server's order back.
      // No `changed`: an order moves no amount, so the host's totals hold.
      if (queued === 0) void reload()
    })
}

/*
 * The Dialog. `dialogKey` changes on every open so a FRESH form is mounted
 * each time: reusing the previous one would open "Add a line" on the draft of
 * the line edited before.
 */
const dialogVisible = ref(false)
const dialogKey = ref(0)
const editingId = ref<string | null>(null)
const dialogTitle = ref('')

function openForm(id: string | null): void {
  editingId.value = id
  dialogKey.value += 1
  dialogVisible.value = true
}

function onWritten(): void {
  dialogVisible.value = false
  void reload()
  emit('changed')
}

const deleteError = ref<string | null>(null)

async function remove(row: BudgetLineRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteBudgetLine(props.budgetId, row.id)
    void reload()
    emit('changed')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This line could not be deleted.'
  }
}
</script>

<template>
  <div class="lines">
    <Message v-if="error" severity="error" :closable="false">
      <div class="list__error">
        <span>{{ error }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="reload" />
      </div>
    </Message>

    <Message v-if="deleteError" severity="error" :closable="false">{{ deleteError }}</Message>

    <Message v-if="reorderError" severity="error" :closable="false">{{ reorderError }}</Message>

    <DataTable
      lazy
      size="small"
      data-key="id"
      removable-sort
      :paginator="total > pageSize"
      :value="ordered ?? rows"
      :loading="loading"
      :total-records="total"
      :first="first"
      :rows="pageSize"
      :sort-field="sortField ?? undefined"
      :sort-order="sortOrder"
      paginator-template="PrevPageLink CurrentPageReport NextPageLink"
      current-page-report-template="{first}–{last} of {totalRecords}"
      @page="onPage"
      @sort="onSort"
      @row-reorder="onRowReorder"
    >
      <template #empty>
        <p class="lines__empty">No line planned for this category yet.</p>
      </template>

      <Column v-if="reorderable" row-reorder style="width: 2.5rem" />

      <!-- No header sort when orderable: the rows ARE the sequence order, and
           a drag in any other order would mean nothing. -->
      <Column field="name" header="Line" :sortable="!orderable" />

      <!-- Hidden when orderable: the row's place is its sequence, and a stale
           number next to a row just dragged would contradict it. -->
      <Column v-if="!orderable" field="sequence" header="Sequence" sortable style="width: 8rem" />

      <Column
        field="planned_amount"
        header="Planned"
        :sortable="!orderable"
        style="width: 10rem"
        header-class="amount-header"
      >
        <template #body="{ data }">
          <div class="amount">{{ formatAmount(data.planned_amount) }}</div>
        </template>
      </Column>

      <Column style="width: 6rem">
        <template #body="{ data }">
          <div class="row-actions__buttons">
            <Button
              v-if="canUpdate"
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              severity="secondary"
              aria-label="Edit"
              @click="openForm(data.id)"
            />
            <DeleteButton
              v-if="canDelete"
              label="Delete this line?"
              :message="`“${data.name}” will be removed from the budget.`"
              size="small"
              @confirm="remove(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Under the table, not in a header: the outer list's "Add category" sits
         at the top right, and two add buttons stacked there would read as
         one. -->
    <div v-if="canCreate" class="lines__footer">
      <Button label="Add line" icon="pi pi-plus" size="small" text @click="openForm(null)" />
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="dialogTitle"
      :style="{ width: '32rem' }"
    >
      <BudgetLineFormView
        :key="dialogKey"
        :id="editingId"
        :budget-id="budgetId"
        :position-id="positionId"
        @saved="onWritten"
        @deleted="onWritten"
        @cancel="dialogVisible = false"
        @title="dialogTitle = $event"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.lines {
  display: grid;
  gap: 0.5rem;
  padding: 0.5rem 0 0.5rem 2.5rem;
}

.lines__empty {
  margin: 0;
  color: var(--app-muted);
}

.lines__footer {
  display: flex;
}

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

:deep(.amount-header .p-datatable-column-header-content) {
  justify-content: flex-end;
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

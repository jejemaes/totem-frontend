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
 * resequence route. <ListView> does the rest once handed that route -- one
 * page holding every line, in sequence order, no header sort, drops chained.
 */
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import type { ListQuery, Page } from '@/api/list'
import { can } from '@/auth/permissions'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
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

/**
 * The resequence route, handed to <ListView> only when a drop can be saved:
 * asked for by the host, and allowed by the scope. Decided once -- ListView
 * reads it at creation to size its single page.
 */
const resequence =
  props.orderable && canUpdate.value
    ? (ids: string[]): Promise<void> => resequenceBudgetLines(props.budgetId, ids)
    : undefined

/** A <Field> slot is handed a generic row: formatAmount wants a line. */
function line(row: ListRow): BudgetLineRow {
  return row as BudgetLineRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

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
  void list.value?.reload()
  emit('changed')
}

const deleteError = ref<string | null>(null)

async function remove(row: BudgetLineRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteBudgetLine(props.budgetId, row.id)
    void list.value?.reload()
    emit('changed')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This line could not be deleted.'
  }
}
</script>

<template>
  <div class="lines">
    <Message v-if="deleteError" severity="error" :closable="false">{{ deleteError }}</Message>

    <!-- NEVER sync-url: it lives inside a Dialog, over a page whose query
         string is not its own. -->
    <ListView
      ref="list"
      :fetch-page="fetchPage"
      sort-field="sequence"
      :sortable="BUDGET_LINE_SORTABLE"
      :page-size="pageSize"
      paginator="compact"
      size="small"
      :resequence="resequence"
      storage-key="budget-lines"
      :extra-fields="['name']"
      empty-text="No line planned for this category yet."
    >
      <Field name="name" label="Line" sortable />

      <!-- Hidden when orderable: the row's place is its sequence, and a stale
           number next to a row just dragged would contradict it. -->
      <Field v-if="!orderable" name="sequence" widget="integer" label="Sequence" sortable
             :width="15" />

      <Field name="planned_amount" label="Planned" sortable align="end" :width="20">
        <template #default="{ row }">
          <div class="amount">{{ formatAmount(line(row).planned_amount) }}</div>
        </template>
      </Field>

      <template #actions="{ row }">
        <Button
          v-if="canUpdate"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Edit"
          @click="openForm(row.id)"
        />
        <DeleteButton
          v-if="canDelete"
          label="Delete this line?"
          :message="`“${row.name}” will be removed from the budget.`"
          size="small"
          @confirm="remove(row)"
        />
      </template>
    </ListView>

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

.lines__footer {
  display: flex;
}

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>

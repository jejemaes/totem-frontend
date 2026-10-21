<script setup lang="ts">
/*
 * The balance of ONE budget: every position, what was planned for it against
 * what was actually booked, and the two totals underneath. No router, like
 * every view: see ContactTagListView for the contract.
 *
 * Not a useResourceList screen, on purpose: no paginator, no sort, no filter
 * bar. The totals are the point of the screen, and a total under a paged table
 * describes the visible page only -- so every position is loaded at once (a
 * budget holds a handful) and summed here.
 *
 * The pencil on a planned amount opens the position's lines in a Dialog:
 * BudgetLineListView, which adds, edits and deletes them through its own form
 * Dialog -- and, `orderable` here only, reorders them by drag. Any write there that moves an
 * amount makes the stored totals stale, so the balance reloads and reports
 * `changed`.
 *
 * The pencil on a practical amount leaves the screen instead: that amount is
 * the sum of the account's movements in the category, and the place to change
 * it is those movements. This view has no router, so it only says which
 * category was asked for (`movements`); the host knows the account and the
 * route.
 *
 * "Add category", next to the totals, opens BudgetPositionFormView in a
 * Dialog -- the one form for a position, so the one-category-per-budget and
 * applicable-category rules are enforced in one place.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import BalanceTotalNumber from '@/components/BalanceTotalNumber.vue'
import ColorTag from '@/components/ColorTag.vue'
import { formatAmount, sumAmounts } from '@/resources/accounts'
import { listBudgetBalance, type BudgetBalanceRow } from '@/resources/budgetPositions'

import BudgetLineListView from './BudgetLineListView.vue'
import BudgetPositionFormView from './BudgetPositionFormView.vue'

const props = defineProps<{
  /** Fixed for the life of the view: a host showing another budget remounts it (`:key`). */
  budgetId: string
  /**
   * The budget's account: it decides which categories can be added. Null while
   * the host has not got it, which only hides "Add category" -- the balance
   * itself does not need it.
   */
  accountId: string | null
}>()

const emit = defineEmits<{
  /** A position or a line was written: the budget's own totals are stale too. */
  changed: []
  /** The practical amount's pencil: the movements of the account in this category. */
  movements: [categoryId: string]
}>()

/** A computed, not a bare `can()`: see ContactListView. Positions reuse the budget scopes. */
const canCreate = computed(() => can('totem.budget.create'))
/**
 * Reading the movements is what the pencil leads to. An unknown account hides
 * it too: there is nowhere to go.
 */
const canOpenMovements = computed(
  () => !!props.accountId && can('totem.accountmovement.read'),
)

const rows = shallowRef<BudgetBalanceRow[]>([])
const loading = ref(false)
/** True once a load has settled: what tells the skeleton from an empty budget. */
const loaded = ref(false)
const error = ref<string | null>(null)

/*
 * The race-ticket idiom of useResourceList: a reload fired by a line edit must
 * not be contradicted by an older response landing after it.
 */
let seq = 0
let inFlight: AbortController | undefined

async function load(): Promise<void> {
  const ticket = ++seq
  inFlight?.abort()
  const controller = (inFlight = new AbortController())

  loading.value = true
  error.value = null
  try {
    const result = await listBudgetBalance(props.budgetId, controller.signal)
    if (ticket !== seq) return
    rows.value = result
    loaded.value = true
  } catch (caught) {
    if (ticket !== seq || controller.signal.aborted) return
    error.value = caught instanceof ApiError ? caught.message : 'The balance could not be loaded.'
  } finally {
    if (ticket === seq) loading.value = false
  }
}

onScopeDispose(() => inFlight?.abort())

void load()

const totalPlanned = computed(() => sumAmounts(rows.value.map((row) => row.total_planned)))
const totalPractical = computed(() => sumAmounts(rows.value.map((row) => row.total_practical)))

const skeletonRows = Array.from(
  { length: 4 },
  (_, i) => ({ id: `skeleton-${i}` }) as BudgetBalanceRow,
)

/*
 * The lines Dialog. `dialogKey` changes on every open so the list is
 * REMOUNTED for the position clicked, rather than reopening on the previous
 * one's page and sort.
 */
const dialogVisible = ref(false)
const dialogKey = ref(0)
const openPosition = ref<BudgetBalanceRow | null>(null)

function openLines(row: BudgetBalanceRow): void {
  openPosition.value = row
  dialogKey.value += 1
  dialogVisible.value = true
}

function onLinesChanged(): void {
  void load()
  emit('changed')
}

/*
 * The "Add category" Dialog, remounted per open through `positionKey` so it
 * never reopens on the draft of a previous, cancelled add.
 */
const positionVisible = ref(false)
const positionKey = ref(0)
const positionTitle = ref('')

function openAddPosition(): void {
  positionKey.value += 1
  positionVisible.value = true
}

function onPositionAdded(): void {
  positionVisible.value = false
  void load()
  emit('changed')
}

defineExpose({ reload: load })
</script>

<template>
  <div class="balance">
    <Message v-if="error" severity="error" :closable="false">
      <div class="list__error">
        <span>{{ error }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="load" />
      </div>
    </Message>

    <DataTable
      data-key="id"
      row-hover
      :value="loaded ? rows : skeletonRows"
      :loading="loading && loaded"
    >
      <template #empty>
        <div class="table-empty">
          <i class="pi pi-chart-bar" />
          <p>No category in this budget yet.</p>
        </div>
      </template>

      <Column field="name" header="Category" style="min-width: 14rem">
        <template #body="{ data }">
          <Skeleton v-if="!loaded" height="1.5rem" />
          <ColorTag v-else :label="data.name" :color="data.color" />
        </template>
      </Column>

      <Column
        field="total_planned"
        header="Planned"
        style="width: 12rem"
        header-class="amount-header"
      >
        <template #body="{ data }">
          <Skeleton v-if="!loaded" height="1rem" />
          <div v-else class="amount amount--editable">
            <span>{{ formatAmount(data.total_planned) }}</span>
            <!-- The amount is the sum of the lines: editing it means editing
                 them, so the pencil opens the lines rather than an input. -->
            <Button
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`Lines of ${data.name}`"
              @click="openLines(data)"
            />
          </div>
        </template>
      </Column>

      <Column
        field="total_practical"
        header="Practical"
        style="width: 12rem"
        header-class="amount-header"
      >
        <template #body="{ data }">
          <Skeleton v-if="!loaded" height="1rem" />
          <div v-else class="amount amount--editable">
            <span>{{ formatAmount(data.total_practical) }}</span>
            <!-- The amount is the sum of the account's movements in the
                 category: editing it means editing them, on their own list. -->
            <Button
              v-if="canOpenMovements && data.category"
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`Movements of ${data.name}`"
              @click="emit('movements', data.category.id)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Under the table rather than in a DataTable footer: a total is the
         answer of the screen, not one more row of it. The add button sits on
         the same row, left, and stays when the budget is still empty -- that
         is exactly when it is needed. -->
    <div v-if="loaded" class="balance__footer">
      <Button
        v-if="canCreate && accountId"
        label="Add category"
        icon="pi pi-plus"
        text
        @click="openAddPosition"
      />
      <dl v-if="rows.length" class="balance__totals">
        <div class="balance__total">
          <dt>Total planned</dt>
          <dd><BalanceTotalNumber :value="totalPlanned" /></dd>
        </div>
        <div class="balance__total">
          <dt>Total practical</dt>
          <dd><BalanceTotalNumber :value="totalPractical" /></dd>
        </div>
      </dl>
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="openPosition?.name ?? 'Lines'"
      :style="{ width: '40rem' }"
    >
      <BudgetLineListView
        v-if="openPosition"
        :key="dialogKey"
        :budget-id="budgetId"
        :position-id="openPosition.id"
        orderable
        @changed="onLinesChanged"
      />
    </Dialog>

    <Dialog
      v-model:visible="positionVisible"
      modal
      :header="positionTitle"
      :style="{ width: '32rem' }"
    >
      <BudgetPositionFormView
        v-if="accountId"
        :key="positionKey"
        :id="null"
        :budget-id="budgetId"
        :account-id="accountId"
        @saved="onPositionAdded"
        @cancel="positionVisible = false"
        @title="positionTitle = $event"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.balance {
  display: grid;
  gap: 1rem;
}

.table-empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--app-muted);
}

.table-empty i {
  font-size: 1.5rem;
}

/* Right-aligned with tabular digits: a money column is scanned by magnitude. */
.amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* The pencil sits AFTER the amount, so the digits stay aligned with the
   header. */
.amount--editable {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
}

:deep(.amount-header .p-datatable-column-header-content) {
  justify-content: flex-end;
}

.balance__footer {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

/* `margin-left: auto` pushes the totals right, under their columns, whether
   or not the add button is there. */
.balance__totals {
  display: flex;
  gap: 3rem;
  margin: 0 0 0 auto;
}

.balance__total {
  display: grid;
  justify-items: end;
  gap: 0.25rem;
}

.balance__total dt {
  font-size: 0.85rem;
  color: var(--app-muted);
}

.balance__total dd {
  margin: 0;
}

.list__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

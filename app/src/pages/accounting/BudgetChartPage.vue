<script setup lang="ts">
/*
 * /accounting/budgets/:id/chart: the page chrome around BudgetPositionChartView,
 * scoped to the budget in the path.
 *
 * The budget is fetched here ONLY for the heading and its totals: the chart
 * reaches the positions through the id alone, so a failed fetch costs the
 * title, never the chart.
 *
 * The view is keyed on the budget: vue-router reuses this page when only the
 * param changes, and the view reads its budget once.
 */
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { formatAmount } from '@/resources/accounts'
import { fetchBudget, type BudgetDetail } from '@/resources/budgets'
import BudgetPositionChartView from '@/views/accounting/BudgetPositionChartView.vue'

const route = useRoute()

const budgetId = computed(() => String(route.params.id))

/** `null` until the first response: no count flashing before it is known. */
const groupCount = ref<number | null>(null)
const budget = ref<BudgetDetail | null>(null)

// The race-ticket idiom of useResourceList: an older response landing last
// must not title the page after the previous budget.
let seq = 0
let inFlight: AbortController | null = null

async function loadBudget(id: string): Promise<void> {
  const ticket = ++seq
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller
  if (budget.value?.id !== id) budget.value = null
  try {
    const loaded = await fetchBudget(id, controller.signal)
    if (ticket === seq) budget.value = loaded
  } catch {
    // Deliberately swallowed: the heading falls back to a generic one, and the
    // chart below reports its own errors -- a 404 there says it better.
  }
}

watch(budgetId, (id) => void loadBudget(id), { immediate: true })
onScopeDispose(() => inFlight?.abort())

const title = computed(() => budget.value?.name ?? 'Budget chart')
</script>

<template>
  <section class="page page--wide">
    <!-- No query carried back: the budgets list reads `?name=` as ITS filter,
         and this page writes `?name=` as the positions'. -->
    <RouterLink :to="{ name: 'accounting-budgets' }" class="budget-chart__back">
      <i class="pi pi-arrow-left" /> Budgets
    </RouterLink>

    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="page__subtitle">
          Positions<template v-if="groupCount !== null"> · {{ groupCount }} group{{ groupCount > 1 ? 's' : '' }}</template>
          <template v-if="budget">
            · planned {{ formatAmount(budget.total_planned_amount) }}
            · practical {{ formatAmount(budget.total_practical_amount) }}
          </template>
        </p>
      </div>
    </header>

    <BudgetPositionChartView
      :key="budgetId"
      :budget-id="budgetId"
      sync-url
      @loaded="groupCount = $event"
    />
  </section>
</template>

<style scoped>
.budget-chart__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  color: var(--app-muted);
  text-decoration: none;
  font-size: 0.9rem;
}

.budget-chart__back:hover {
  color: var(--p-primary-color);
}
</style>

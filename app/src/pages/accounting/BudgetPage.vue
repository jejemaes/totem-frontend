<script setup lang="ts">
/*
 * /accounting/budgets/new and /accounting/budgets/:id: the page chrome around
 * BudgetFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { BudgetDetail } from '@/resources/budgets'
import BudgetFormView from '@/views/accounting/BudgetFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'accounting-budgets', query: route.query }))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(budget: BudgetDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'accounting-budget-edit',
    params: { id: String(budget.id) },
    query: route.query,
  })
}

/**
 * The movements behind one practical amount: the account's list, filtered on
 * the category through the query string -- the movements list reads its
 * filters from there, so the link is also what Back and F5 restore.
 */
function openMovements(accountId: string, categoryId: string): void {
  void router.push({
    name: 'accounting-account-movements',
    params: { accountId },
    query: { category: categoryId },
  })
}

function openChart(id: string): void {
  // The query is NOT carried, as from BudgetsPage: the list's `?name=` filter
  // would be read by the chart page as a filter on the positions' name.
  void router.push({ name: 'accounting-budget-chart', params: { id } })
}

function backToList(): void {
  void router.push(listRoute.value)
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
      </div>
    </header>

    <BudgetFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
      @movements="openMovements"
      @chart="openChart"
    />
  </section>
</template>

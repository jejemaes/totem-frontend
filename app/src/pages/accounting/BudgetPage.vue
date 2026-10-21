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

function onSaved(budget: BudgetDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // `name` and not `search`: this endpoint's free-text filter. The list
        // opens on the row just created instead of wherever the sort puts it.
        { name: 'accounting-budgets', query: { name: budget.name } }
      : listRoute.value,
  )
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
    />
  </section>
</template>

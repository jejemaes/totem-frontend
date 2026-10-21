<script setup lang="ts">
/*
 * /accounting/budgets: the page chrome around BudgetListView, and the ONE place
 * that knows what opening a row means here -- a route push.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import BudgetListView from '@/views/accounting/BudgetListView.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.budget.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({ name: 'accounting-budget-edit', params: { id }, query: route.query })
}
</script>

<template>
  <section class="page page--wide">
    <header class="page__header">
      <div>
        <h1>Budgets</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">{{ total }} budget{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" :to="{ name: 'accounting-budget-create', query: route.query }">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <BudgetListView sync-url @open="openRecord" @loaded="total = $event" />
  </section>
</template>

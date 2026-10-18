<script setup lang="ts">
/*
 * /accounting/accounts: the page chrome around AccountListView, and the ONE
 * place that knows what opening a row -- or its movements -- means here: a
 * route push. The view itself has no router.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import AccountListView from '@/views/accounting/AccountListView.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.account.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({ name: 'accounting-account-edit', params: { id }, query: route.query })
}

/**
 * The query string is NOT carried here, unlike openRecord: the movements list
 * syncs its own page, sort and filters into the URL, and would read this
 * list's `?search=` as a search on movements.
 */
function openMovements(accountId: string): void {
  void router.push({ name: 'accounting-account-movements', params: { accountId } })
}
</script>

<template>
  <section class="page page--wide">
    <header class="page__header">
      <div>
        <h1>Accounts</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">{{ total }} account{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" :to="{ name: 'accounting-account-create', query: route.query }">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <AccountListView
      sync-url
      @open="openRecord"
      @movements="openMovements"
      @loaded="total = $event"
    />
  </section>
</template>

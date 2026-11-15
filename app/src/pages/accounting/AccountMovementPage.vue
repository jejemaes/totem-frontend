<script setup lang="ts">
/*
 * /accounting/accounts/:accountId/movements/new and .../movements/:id: the page
 * chrome around AccountMovementFormView, and where its events become
 * navigation -- always back to THIS account's movements.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { AccountMovementDetail } from '@/resources/accountMovements'
import AccountMovementFormView from '@/views/accounting/AccountMovementFormView.vue'

const route = useRoute()
const router = useRouter()

const accountId = computed(() => String(route.params.accountId))
const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({
  name: 'accounting-account-movements',
  params: { accountId: accountId.value },
  query: route.query,
}))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(movement: AccountMovementDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'accounting-account-movement-edit',
    params: { accountId: accountId.value, id: String(movement.id) },
    query: route.query,
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

    <AccountMovementFormView
      :id="id"
      :account-id="accountId"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

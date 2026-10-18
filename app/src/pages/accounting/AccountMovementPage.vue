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

function onSaved(movement: AccountMovementDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // The backend's `search` matches the name, so the list opens on the
        // row just created instead of wherever the date sort puts it.
        {
          name: 'accounting-account-movements',
          params: { accountId: accountId.value },
          query: { search: movement.name },
        }
      : listRoute.value,
  )
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

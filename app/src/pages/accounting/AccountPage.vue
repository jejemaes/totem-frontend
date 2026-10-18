<script setup lang="ts">
/*
 * /accounting/accounts/new and /accounting/accounts/:id: the page chrome around
 * AccountFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { AccountDetail } from '@/resources/accounts'
import AccountFormView from '@/views/accounting/AccountFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'accounting-accounts', query: route.query }))
const title = ref('')

function onSaved(account: AccountDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // `search` matches the code, which is short and exact: the list opens
        // on the row just created instead of wherever the code sort puts it.
        { name: 'accounting-accounts', query: { search: account.code } }
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

    <AccountFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

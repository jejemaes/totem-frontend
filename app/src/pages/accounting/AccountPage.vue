<script setup lang="ts">
/*
 * /accounting/accounts/new and /accounting/accounts/:id: the page chrome around
 * AccountFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { crumbState, type Crumb } from '@/components/breadcrumbs'
import type { AccountDetail } from '@/resources/accounts'
import AccountFormView from '@/views/accounting/AccountFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'accounting-accounts', query: route.query }))
const title = ref('')

/**
 * The trail handed to a page opened from this form: the list it was opened
 * from -- with the query it came with -- then this record.
 */
function crumbs(): Crumb[] {
  return [
    { label: 'Accounts', to: router.resolve(listRoute.value).fullPath },
    { label: title.value || 'Account', to: route.fullPath },
  ]
}

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(account: AccountDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'accounting-account-edit',
    params: { id: String(account.id) },
    query: route.query,
  })
}

/**
 * The same navigation as AccountsPage's: the query string is NOT carried, the
 * movements list would read the account list's `?search=` as its own. The
 * trail leads back here, not to the list.
 */
function openMovements(accountId: string): void {
  void router.push({
    name: 'accounting-account-movements',
    params: { accountId },
    state: crumbState(crumbs()),
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

    <AccountFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @movements="openMovements"
      @title="title = $event"
    />
  </section>
</template>

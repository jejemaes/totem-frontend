<script setup lang="ts">
/*
 * /accounting/categories/new and /accounting/categories/:id: the page chrome
 * around AccountCategoryFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { AccountCategoryDetail } from '@/resources/accountCategories'
import AccountCategoryFormView from '@/views/accounting/AccountCategoryFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'accounting-categories', query: route.query }))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(category: AccountCategoryDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'accounting-category-edit',
    params: { id: String(category.id) },
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

    <AccountCategoryFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

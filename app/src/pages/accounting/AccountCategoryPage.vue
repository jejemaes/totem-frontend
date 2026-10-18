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

function onSaved(category: AccountCategoryDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // The backend's `search` matches the name, so the list opens on the
        // row just created.
        { name: 'accounting-categories', query: { search: category.name } }
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

    <AccountCategoryFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

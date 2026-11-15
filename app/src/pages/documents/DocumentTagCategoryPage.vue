<script setup lang="ts">
/*
 * /documents/tag-categories/new and /documents/tag-categories/:id: the page
 * chrome around DocumentTagCategoryFormView, and where its events become
 * navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { DocumentTagCategoryDetail } from '@/resources/documentTagCategories'
import DocumentTagCategoryFormView from '@/views/documents/DocumentTagCategoryFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(category: DocumentTagCategoryDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'document-tag-category-edit',
    params: { id: String(category.id) },
    query: route.query,
  })
}

/** The tree is not paged nor filtered: there is no query string to carry back. */
function backToList(): void {
  void router.push({ name: 'document-tag-categories' })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="page__subtitle">Its colour paints every tag of the category.</p>
      </div>
    </header>

    <DocumentTagCategoryFormView
      :id="id"
      @saved="onSaved"
      @deleted="backToList"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>

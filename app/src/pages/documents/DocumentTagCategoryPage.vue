<script setup lang="ts">
/*
 * /documents/tag-categories/new and /documents/tag-categories/:id: the page
 * chrome around DocumentTagCategoryFormView, and where its events become
 * navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DocumentTagCategoryFormView from '@/views/documents/DocumentTagCategoryFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const title = ref('')

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
      @saved="backToList"
      @deleted="backToList"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>

<script setup lang="ts">
/*
 * /documents/tag-categories: the page chrome around the categories tree, and
 * where its `open` becomes a route push. The tags are edited inside the tree,
 * in Dialogs -- they have no route of their own.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import DocumentTagCategoryTreeView from '@/views/documents/DocumentTagCategoryTreeView.vue'

const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.documenttagcategory.create'))

const total = ref<number | null>(null)

function openRecord(id: string): void {
  void router.push({ name: 'document-tag-category-edit', params: { id } })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Tag categories</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">
            {{ total }} categor{{ total === 1 ? 'y' : 'ies' }} — open one to edit its tags.
          </template>
        </p>
      </div>

      <RouterLink v-if="canCreate" :to="{ name: 'document-tag-category-create' }">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <DocumentTagCategoryTreeView @open="openRecord" @loaded="total = $event" />
  </section>
</template>

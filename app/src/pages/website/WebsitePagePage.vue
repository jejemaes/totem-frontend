<script setup lang="ts">
/*
 * /website/pages/new and /website/pages/:id: the page chrome around
 * WebsitePageFormView, and where its events become navigation. Kept out of the
 * view on purpose -- "back to the list, with its query string" means nothing
 * inside a Dialog.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { WebsitePageDetail } from '@/resources/websitePages'
import WebsitePageFormView from '@/views/website/WebsitePageFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'website-pages', query: route.query }))
const title = ref('')

function onSaved(page: WebsitePageDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // The backend's `search` matches the title or the slug, so the list
        // opens on the row just created instead of wherever the title sort
        // puts it.
        { name: 'website-pages', query: { search: page.title } }
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

    <WebsitePageFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

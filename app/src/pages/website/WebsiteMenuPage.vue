<script setup lang="ts">
/*
 * /website/menus/new and /website/menus/:id: the page chrome around
 * WebsiteMenuFormView, and where its events become navigation. Kept out of the
 * view on purpose -- "back to the list, with its query string" means nothing
 * inside a Dialog.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { WebsiteMenuDetail } from '@/resources/websiteMenus'
import WebsiteMenuFormView from '@/views/website/WebsiteMenuFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'website-menus', query: route.query }))
const title = ref('')

function onSaved(menu: WebsiteMenuDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // The backend's `search` matches the name, so the list opens on the
        // row just created instead of wherever the sequence sort puts it.
        { name: 'website-menus', query: { search: menu.name } }
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

    <WebsiteMenuFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

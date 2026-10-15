<script setup lang="ts">
/*
 * /contact-tags/new and /contact-tags/:id: the page chrome around
 * ContactTagFormView, and where its events become navigation. Kept out of the
 * view on purpose -- "back to the list, with its query string" means nothing
 * inside a Dialog.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { ContactTagDetail } from '@/resources/contactTags'
import ContactTagFormView from '@/views/contacts/ContactTagFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'contact-tags', query: route.query }))
const title = ref('')

function onSaved(tag: ContactTagDetail, mode: 'create' | 'edit'): void {
  void router.push(
    // The name is unique, so `search` opens the list on exactly the row just
    // created.
    mode === 'create' ? { name: 'contact-tags', query: { search: tag.name } } : listRoute.value,
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
        <p class="page__subtitle">Tags can be granted to contacts.</p>
      </div>
    </header>

    <ContactTagFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>

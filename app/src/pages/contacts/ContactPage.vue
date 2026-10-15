<script setup lang="ts">
/*
 * /contacts/new and /contacts/:id: the page chrome around ContactFormView, and
 * where its events become navigation. Kept out of the view on purpose -- "back
 * to the list, with its query string" means nothing inside a Dialog.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { ContactDetail } from '@/resources/contacts'
import ContactFormView from '@/views/contacts/ContactFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'contacts', query: route.query }))
const title = ref('')

function onSaved(contact: ContactDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // The backend's `search` matches the first name, the last name or the
        // email, so the list opens on the row just created. Without it, with
        // the default last-name-ascending sort and ten rows per page, a new
        // contact can land on page 3 and the redirect looks like nothing
        // happened.
        { name: 'contacts', query: { search: contact.last_name } }
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

    <ContactFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>

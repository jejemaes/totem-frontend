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

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(contact: ContactDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'contact-edit',
    params: { id: String(contact.id) },
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

    <ContactFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>

<script setup lang="ts">
/*
 * /contacts: the page chrome around ContactListView, and the ONE place that
 * knows what opening a row means here -- a route push. The view itself has no
 * router, which is what lets it open in a Dialog elsewhere.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import ContactListView from '@/views/contacts/ContactListView.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.contact.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({ name: 'contact-edit', params: { id }, query: route.query })
}
</script>

<template>
  <section class="page page--wide">
    <header class="page__header">
      <div>
        <h1>Contacts</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">{{ total }} contact{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" :to="{ name: 'contact-create', query: route.query }">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <ContactListView sync-url @open="openRecord" @loaded="total = $event" />
  </section>
</template>

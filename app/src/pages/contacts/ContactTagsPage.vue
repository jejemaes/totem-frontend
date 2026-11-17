<script setup lang="ts">
/*
 * /contact-tags: the page chrome around ContactTagListView, and the ONE place
 * that knows what opening a row means here -- a route push. The view itself has
 * no router, which is what lets it open in a Dialog elsewhere.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import ContactTagListView from '@/views/contacts/ContactTagListView.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.contacttag.create'))

/** `null` until the first response: no "0 tags" flashing before the count is known. */
const total = ref<number | null>(null)

function openTag(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({ name: 'contact-tag-edit', params: { id }, query: route.query })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Contact tags</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">{{ total }} tag{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" :to="{ name: 'contact-tag-create', query: route.query }">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <ContactTagListView sync-url @open="openTag" @loaded="total = $event" />
  </section>
</template>

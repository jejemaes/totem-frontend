<script setup lang="ts">
/*
 * /settings/payment-methods: the page chrome around PaymentMethodListView, and
 * the ONE place that knows what opening a row means here: a route push. The
 * view itself has no router.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import PaymentMethodListView from '@/views/settings/PaymentMethodListView.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.paymentmethod.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({ name: 'settings-payment-method-edit', params: { id }, query: route.query })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Payment methods</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">
            {{ total }} payment method{{ total > 1 ? 's' : '' }}
          </template>
        </p>
      </div>

      <RouterLink
        v-if="canCreate"
        :to="{ name: 'settings-payment-method-create', query: route.query }"
      >
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <PaymentMethodListView sync-url @open="openRecord" @loaded="total = $event" />
  </section>
</template>

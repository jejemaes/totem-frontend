<script setup lang="ts">
/*
 * /accounting/payments: the page chrome around PaymentListView. No New button
 * and no form route -- a payment is registered from the document it settles,
 * and this collection is read only.
 */
import { ref } from 'vue'

import PaymentListView from '@/views/accounting/PaymentListView.vue'

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Payments</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">{{ total }} payment{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>
    </header>

    <PaymentListView sync-url @loaded="total = $event" />
  </section>
</template>

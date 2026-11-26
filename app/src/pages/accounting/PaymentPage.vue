<script setup lang="ts">
/*
 * /accounting/payments/new and /accounting/payments/:id: the page chrome around
 * PaymentFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { PaymentDetail } from '@/resources/payments'
import PaymentFormView from '@/views/accounting/PaymentFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(payment: PaymentDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'accounting-payment-edit',
    params: { id: String(payment.id) },
    query: route.query,
  })
}

function backToList(): void {
  void router.push({ name: 'accounting-payments', query: route.query })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
      </div>
    </header>

    <PaymentFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

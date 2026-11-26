<script setup lang="ts">
/*
 * /settings/payment-methods/new and /settings/payment-methods/:id: the page
 * chrome around PaymentMethodFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { PaymentMethodDetail } from '@/resources/paymentMethods'
import PaymentMethodFormView from '@/views/settings/PaymentMethodFormView.vue'

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
function onSaved(method: PaymentMethodDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'settings-payment-method-edit',
    params: { id: String(method.id) },
    query: route.query,
  })
}

function backToList(): void {
  void router.push({ name: 'settings-payment-methods', query: route.query })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
      </div>
    </header>

    <PaymentMethodFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

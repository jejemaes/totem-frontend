<script setup lang="ts">
/*
 * /accounting/invoices/new and /accounting/invoices/:id: the page chrome around
 * InvoiceFormView, and where its events become navigation.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { InvoiceDetail } from '@/resources/invoices'
import InvoiceFormView from '@/views/accounting/InvoiceFormView.vue'

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
function onSaved(invoice: InvoiceDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'accounting-invoice-edit',
    params: { id: String(invoice.id) },
    query: route.query,
  })
}

function backToList(): void {
  void router.push({ name: 'accounting-invoices', query: route.query })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
      </div>
    </header>

    <InvoiceFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @deleted="backToList"
      @title="title = $event"
    />
  </section>
</template>

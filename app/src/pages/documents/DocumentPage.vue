<script setup lang="ts">
/*
 * /documents/documents/file/new, /documents/documents/text/new and
 * /documents/documents/:id: the page chrome around DocumentFormView, and where
 * its events become navigation.
 *
 * The type of a new document comes from the ROUTE NAME: two create routes
 * rather than a `?type=` query, so the type is not one more key of the list's
 * query string carried back and forth, and a hand-edited URL cannot ask for a
 * third type.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { DocumentDetail, DocumentType } from '@/resources/documents'
import DocumentFormView from '@/views/documents/DocumentFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const documentType = computed<DocumentType>(() =>
  route.name === 'document-text-create' ? 'text' : 'file',
)
const listRoute = computed(() => ({ name: 'documents', query: route.query }))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(document: DocumentDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'document-edit',
    params: { id: String(document.id) },
    query: route.query,
  })
}

/** Back to the list, with its query string. */
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

    <DocumentFormView
      :id="id"
      :document-type="documentType"
      @saved="onSaved"
      @deleted="backToList"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>

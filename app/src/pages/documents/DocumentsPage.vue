<script setup lang="ts">
/*
 * /documents/documents: the page chrome around DocumentListView or
 * DocumentCardView, and the ONE place that knows what opening a record means
 * here -- a route push.
 *
 * No "New": a document is created as one of two TYPES, so the header offers
 * "Upload" and "New text". "New text" is a route to the create form, whose
 * type the route fixes. "Upload" picks up to twenty files and uploads them
 * with shared tags, contact and user (DocumentUploadButton). ONE file then
 * opens its edit form, where the rest is filled in; several reload the view
 * on them instead -- there is no single form to open, and the newest-first
 * default order puts them at the top.
 *
 * List or cards is `?view_type=`, owned HERE, as on UsersPage.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import { VIEW_TYPE_KEY, viewTypeFromQuery, type ViewType } from '@/components/viewSwitcher'
import type { DocumentDetail } from '@/resources/documents'
import DocumentCardView from '@/views/documents/DocumentCardView.vue'
import DocumentListView from '@/views/documents/DocumentListView.vue'
import DocumentUploadButton from '@/views/documents/DocumentUploadButton.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.document.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)

/** Cards first: a document is recognised by its preview before its name. */
const VIEWS: readonly ViewType[] = ['card', 'list']

const viewType = computed<ViewType>(() => viewTypeFromQuery(route.query, VIEWS))

function setViewType(view: ViewType): void {
  // `page` and `page_size` go: the two views page by different sizes.
  const { page: _page, page_size: _pageSize, ...kept } = route.query
  void router.replace({ query: { ...kept, [VIEW_TYPE_KEY]: view } })
}

/** Why the last upload was refused; cleared by the next pick. */
const uploadError = ref<string | null>(null)
/** How many files the last batch created, for the banner. */
const uploaded = ref<number | null>(null)

/** Whichever view is mounted: both expose `reload`. */
const view = useTemplateRef<{ reload(): Promise<void> }>('view')

function onUploaded(documents: DocumentDetail[]): void {
  if (documents.length === 1) {
    openRecord(documents[0]!.id)
    return
  }
  uploaded.value = documents.length
  void view.value?.reload()
}

function onUploadFailed(message: string | null): void {
  uploadError.value = message
  uploaded.value = null
}

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // view and filters.
  void router.push({ name: 'document-edit', params: { id }, query: route.query })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Documents</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">
            {{ total }} document{{ total === 1 ? '' : 's' }}
          </template>
        </p>
      </div>

      <div class="documents__actions">
        <ViewSwitcher :model-value="viewType" :views="VIEWS" @update:model-value="setViewType" />

        <template v-if="canCreate">
          <RouterLink :to="{ name: 'document-text-create', query: route.query }">
            <Button label="New text" icon="pi pi-pencil" outlined />
          </RouterLink>
          <DocumentUploadButton @uploaded="onUploaded" @failed="onUploadFailed" />
        </template>
      </div>
    </header>

    <Message v-if="uploadError" severity="error" closable @close="uploadError = null">
      {{ uploadError }}
    </Message>
    <Message v-if="uploaded" severity="success" closable @close="uploaded = null">
      {{ uploaded }} documents uploaded.
    </Message>

    <!-- One at a time, with `v-if`: only the mounted view writes the query string. -->
    <DocumentCardView
      v-if="viewType === 'card'"
      ref="view"
      sync-url
      @open="openRecord"
      @loaded="total = $event"
    />
    <DocumentListView v-else ref="view" sync-url @open="openRecord" @loaded="total = $event" />
  </section>
</template>

<style scoped>
.documents__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>

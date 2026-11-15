<script setup lang="ts">
/*
 * The tags of ONE category: what a row of the categories tree expands into.
 *
 * Paged, AND reorderable by drag on any page: the backend's resequence route
 * takes the page's offset with its ids (`{ids, offset}`), so ListView's
 * `resequence-paged` sends the page's order and where it starts, rather than
 * holding every tag on one page. A tag moves within its page; to move one
 * further, the paginator's row count is the lever.
 *
 * NEVER `syncUrl`: several of these can be open at once under one page, and
 * the query string is the tree's host's. The category is a prop forced into
 * every request, like the position of BudgetLineListView -- whose Dialog
 * pattern this copies: adding and editing open DocumentTagFormView in a Dialog,
 * remounted per open through `dialogKey`.
 */
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import type { ListQuery, Page } from '@/api/list'
import { can } from '@/auth/permissions'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import ListView from '@/components/list/ListView.vue'
import {
  deleteDocumentTag,
  DOCUMENT_TAG_SORTABLE,
  listDocumentTags,
  resequenceDocumentTags,
  type DocumentTagFilters,
  type DocumentTagRow,
} from '@/resources/documentTags'

import DocumentTagFormView from './DocumentTagFormView.vue'

const props = withDefaults(
  defineProps<{
    /** The category whose tags are listed. Fixed for the life of the view. */
    categoryId: string
    pageSize?: number
  }>(),
  { pageSize: 10 },
)

/** Computeds, not bare `can()` calls: see ContactListView. */
const canCreate = computed(() => can('totem.documenttag.create'))
const canUpdate = computed(() => can('totem.documenttag.update'))
const canDelete = computed(() => can('totem.documenttag.delete'))

/** The fetcher with the category forced in. */
function fetchPage(
  query: ListQuery<DocumentTagFilters>,
  signal: AbortSignal,
): Promise<Page<DocumentTagRow>> {
  return listDocumentTags(
    { ...query, filters: { ...query.filters, category: props.categoryId } },
    signal,
  )
}

/**
 * The resequence route, handed to <ListView> only when a drop can be saved:
 * numbering the tags is updating them, server-side. Decided once -- ListView
 * reads it at creation.
 */
const resequence = canUpdate.value ? resequenceDocumentTags : undefined

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

/*
 * The Dialog. `dialogKey` changes on every open so a FRESH form is mounted
 * each time: reusing the previous one would open "New tag" on the draft of the
 * tag edited before.
 */
const dialogVisible = ref(false)
const dialogKey = ref(0)
const editingId = ref<string | null>(null)
const dialogTitle = ref('')

function openForm(id: string | null): void {
  editingId.value = id
  dialogKey.value += 1
  dialogVisible.value = true
}

function onSaved(): void {
  dialogVisible.value = false
  void list.value?.reload()
}

const deleteError = ref<string | null>(null)

async function remove(row: DocumentTagRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteDocumentTag(row.id)
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This tag could not be deleted.'
  }
}
</script>

<template>
  <div class="tags">
    <Message v-if="deleteError" severity="error" closable @close="deleteError = null">
      {{ deleteError }}
    </Message>

    <ListView
      ref="list"
      :fetch-page="fetchPage"
      sort-field="sequence"
      :sortable="DOCUMENT_TAG_SORTABLE"
      :page-size="pageSize"
      paginator="compact"
      size="small"
      :resequence="resequence"
      resequence-paged
      :extra-fields="['name']"
      empty-text="No tag in this category yet."
    >
      <Field name="name" label="Tag" />

      <template #actions="{ row }">
        <Button
          v-if="canUpdate"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Edit"
          @click="openForm(row.id)"
        />
        <DeleteButton
          v-if="canDelete"
          label="Delete this tag?"
          :message="`“${row.name}” will be deleted and removed from every document carrying it.`"
          size="small"
          @confirm="remove(row)"
        />
      </template>
    </ListView>

    <div v-if="canCreate" class="tags__footer">
      <Button label="New tag" icon="pi pi-plus" size="small" text @click="openForm(null)" />
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="dialogTitle"
      :style="{ width: '28rem' }"
    >
      <DocumentTagFormView
        :key="dialogKey"
        :id="editingId"
        :category-id="categoryId"
        @saved="onSaved"
        @cancel="dialogVisible = false"
        @title="dialogTitle = $event"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.tags {
  display: grid;
  gap: 0.5rem;
  padding: 0.25rem 0 0.5rem;
}

.tags__footer {
  display: flex;
}
</style>

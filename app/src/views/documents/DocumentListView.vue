<script setup lang="ts">
/*
 * The documents as a table, with the SAME filter bar as DocumentCardView -- one
 * declaration, documentFilters.ts, so a switch between the two keeps the
 * filters. Router-free like every view: see ContactTagListView for the contract.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import { formatFileSize } from '@/components/fileSize'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import { displayContact } from '@/resources/contacts'
import {
  deleteDocument,
  documentIcon,
  DOCUMENT_SORTABLE,
  listDocuments,
  type DocumentFilters,
  type DocumentRow,
} from '@/resources/documents'
import { displayUser } from '@/resources/users'

import { DOCUMENT_FILTER_FIELDS } from './documentFilters'

const props = withDefaults(
  defineProps<{
    /** Mirror page, sort and filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
    pageSize?: number
  }>(),
  { syncUrl: false, pageSize: 10 },
)

const emit = defineEmits<{
  /** The edit button of a row: what that means is up to the caller. */
  open: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.document.update'))
const canDelete = computed(() => can('totem.document.delete'))

const { filters, setFilters, updateFilters, activeFilters } = useFilter<DocumentFilters>(
  DOCUMENT_FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A <Field> slot is handed a generic row: the helpers below want a document. */
function document(row: ListRow): DocumentRow {
  return row as DocumentRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

async function remove(row: DocumentRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteDocument(row.id)
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This document could not be deleted.'
  }
}

defineExpose({ reload: (): Promise<void> => list.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <div class="documents">
    <Message v-if="deleteError" severity="error" closable @close="deleteError = null">
      {{ deleteError }}
    </Message>

    <!-- Sorted newest first, the backend's own default ordering. `name` and
         `file` are read by the row's buttons whatever the columns: the
         confirmation quotes the name, the download needs the URL. -->
    <ListView
      ref="list"
      :fetch-page="listDocuments"
      :filters="filters"
      sort-field="create_date"
      :sort-order="-1"
      :sortable="DOCUMENT_SORTABLE"
      :page-size="pageSize"
      :sync-url="syncUrl"
      storage-key="documents"
      :extra-fields="['name', 'file']"
      @loaded="emit('loaded', $event)"
    >
      <template #header="{ loading, reload }">
        <MultiRecordFilters
          :fields="DOCUMENT_FILTER_FIELDS"
          :filters="filters"
          :active-filters="activeFilters"
          :loading="loading"
          search-placeholder="Search a name…"
          @apply="setFilters"
          @patch="updateFilters"
          @refresh="reload"
        />
      </template>

      <template #empty>
        <div class="table-empty">
          <i class="pi pi-folder-open" />
          <p v-if="filters.search">No document matches “{{ filters.search }}”.</p>
          <p v-else>No document yet.</p>
        </div>
      </template>

      <!-- The icon reads the type and the mimetype, hence `fields`. -->
      <Field name="name" label="Name" sortable :fields="['name', 'document_type', 'mimetype']">
        <template #default="{ row }">
          <div class="document-cell">
            <i :class="documentIcon(document(row))" class="document-cell__icon" />
            <span class="document-cell__name">{{ document(row).name }}</span>
          </div>
        </template>
      </Field>

      <Field name="size" label="Size" sortable align="end" :width="10">
        <template #default="{ value }">
          <div class="size">{{ formatFileSize(value) ?? '—' }}</div>
        </template>
      </Field>

      <Field name="date" widget="date" label="Date" sortable :width="12" />

      <Field
        name="user"
        widget="many2one"
        label="User"
        :options="{ relationDisplay: displayUser }"
      />

      <Field
        name="contact"
        widget="many2one"
        label="Contact"
        :options="{ relationDisplay: displayContact }"
      />

      <!-- A relation: the backend cannot order on it. -->
      <Field name="tags" widget="many2many_tags" label="Tags" />

      <template #actions="{ row }">
        <!-- A plain link: the signed URL serves the bytes, `download` keeps the
             browser from navigating to a PDF instead of saving it. -->
        <Button
          v-if="row.file"
          as="a"
          :href="row.file"
          download
          icon="pi pi-download"
          text
          rounded
          severity="secondary"
          aria-label="Download"
        />
        <Button
          v-if="canUpdate"
          icon="pi pi-pencil"
          text
          rounded
          severity="secondary"
          aria-label="Edit"
          @click="emit('open', row.id)"
        />
        <DeleteButton
          v-if="canDelete"
          label="Delete this document?"
          :message="`“${row.name}” will be deleted, with its file.`"
          @confirm="remove(row)"
        />
      </template>
    </ListView>
  </div>
</template>

<style scoped>
.documents {
  display: grid;
  gap: 0.75rem;
}

.document-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.document-cell__icon {
  color: var(--app-muted);
}

.document-cell__name {
  font-weight: 500;
}

/* Right-aligned with tabular digits: a size column is scanned by magnitude. */
.size {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.table-empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--app-muted);
}

.table-empty i {
  font-size: 1.5rem;
}
</style>

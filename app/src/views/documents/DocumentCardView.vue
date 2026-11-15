<script setup lang="ts">
/*
 * The documents as cards, with the SAME filter bar as DocumentListView -- one
 * declaration, documentFilters.ts, so a switch between the two keeps the
 * filters.
 *
 * The cover is the thumbnail the backend made at upload (images and PDFs);
 * anything else -- a text, a spreadsheet, a file whose preview failed -- gets
 * its type's icon, so the grid keeps one height. Router-free like every view:
 * a click on a card emits `open`, and the page decides it is a route push.
 */
import Button from 'primevue/button'
import { useTemplateRef } from 'vue'

import CardView from '@/components/card/CardView.vue'
import Field from '@/components/card/Field.vue'
import type { CardRecord } from '@/components/card/fields/types'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import { useFilter } from '@/composables/useFilter'
import {
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
    /** Mirror page and filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
    pageSize?: number
  }>(),
  { syncUrl: false, pageSize: 12 },
)

const emit = defineEmits<{
  /** A click on a card: what that means is up to the caller. */
  open: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

const { filters, setFilters, updateFilters, activeFilters } = useFilter<DocumentFilters>(
  DOCUMENT_FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A card slot is handed a generic record: the helpers below want a document. */
function document(record: CardRecord): DocumentRow {
  return record as DocumentRow
}

/*
 * Declared once, outside the template: an object literal naming a binding is
 * rebuilt on every render, and each new one is a new prop for every card.
 */
const USER_OPTIONS = { relationDisplay: displayUser }

const cards = useTemplateRef<{ reload(): Promise<void> }>('cards')

defineExpose({ reload: (): Promise<void> => cards.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <CardView
    ref="cards"
    :fetch-page="listDocuments"
    :filters="filters"
    sort-field="create_date"
    :sort-order="-1"
    :sortable="DOCUMENT_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    empty-text="No document."
    @click="emit('open', String($event.id))"
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
      <div class="document-cards__empty">
        <i class="pi pi-folder-open" />
        <p v-if="filters.search">No document matches “{{ filters.search }}”.</p>
        <p v-else>No document yet.</p>
      </div>
    </template>

    <!-- The icon fallback reads the type and the mimetype, hence `fields`. -->
    <template #cover>
      <Field name="thumbnail" :fields="['thumbnail', 'document_type', 'mimetype', 'name']">
        <template #default="{ data, value }">
          <div class="document-cards__cover">
            <img
              v-if="typeof value === 'string' && value"
              :src="value"
              :alt="document(data).name"
              class="document-cards__thumbnail"
              loading="lazy"
            />
            <i v-else :class="documentIcon(document(data))" class="document-cards__icon" />
          </div>
        </template>
      </Field>
    </template>

    <template #title>
      <Field name="name">
        <template #default="{ value }">
          <span class="document-cards__title" :title="String(value ?? '')">{{ value }}</span>
        </template>
      </Field>
    </template>

    <template #content>
      <div class="document-cards__details">
        <Field name="user" widget="many2one" label="User" :options="USER_OPTIONS" />
        <Field name="date" widget="date" label="Date" />
      </div>
    </template>

    <template #footer>
      <div class="document-cards__footer">
        <Field name="tags" widget="many2many_tags" />
        <!-- A plain link, so the card's own click leaves it alone
             (isInteractiveTarget). A text has no file to download. -->
        <Field name="file">
          <template #default="{ value }">
            <Button
              v-if="typeof value === 'string' && value"
              as="a"
              :href="value"
              download
              label="Download"
              icon="pi pi-download"
              size="small"
              outlined
            />
          </template>
        </Field>
      </div>
    </template>
  </CardView>
</template>

<style scoped>
.document-cards__cover {
  display: grid;
  place-items: center;
  height: 9rem;
  overflow: hidden;
  background: var(--app-inset);
}

.document-cards__thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.document-cards__icon {
  font-size: 2.5rem;
  color: var(--app-muted);
}

/* One line: a long file name must not make its card taller than the others. */
.document-cards__title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-cards__details {
  display: grid;
  gap: 0.35rem;
}

/* Tags above, Download below: on one line, a card with many tags squeezed
   the button, and the button's position moved from card to card. */
.document-cards__footer {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
}

.document-cards__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1rem;
  color: var(--app-muted);
}

.document-cards__empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.document-cards__empty p {
  margin: 0;
}
</style>

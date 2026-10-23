<script setup lang="ts">
/*
 * The website page table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { computed, ref, useTemplateRef } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import DeleteButton from '@/components/list/DeleteButton.vue'
import Field from '@/components/list/Field.vue'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  deleteWebsitePage,
  listWebsitePages,
  WEBSITE_PAGE_SORTABLE,
  type WebsitePageFilters,
  type WebsitePageRow,
} from '@/resources/websitePages'

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
const canUpdate = computed(() => can('totem.websitepage.update'))
const canDelete = computed(() => can('totem.websitepage.delete'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL -- one name, so a link is
 * always a faithful description of the request behind it.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the title or the slug.',
  },
  title: {
    type: 'string',
    label: 'Title',
    help_text: 'Filter on the page title.',
  },
  slug: {
    type: 'string',
    label: 'Slug',
    help_text: 'Filter on the URL slug.',
  },
  is_published: {
    type: 'boolean',
    label: 'Published',
    help_text: 'Keep the published pages, or the drafts.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<WebsitePageFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

/**
 * A page a menu item points at cannot be removed: that FK is
 * `on_delete=PROTECT`. The refusal is shown as-is: the backend names the reason
 * better than a generic message would.
 */
async function remove(row: WebsitePageRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteWebsitePage(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This page could not be deleted.'
  }
}

defineExpose({ reload: (): Promise<void> => list.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
    {{ deleteError }}
  </Message>

  <ListView
    ref="list"
    :fetch-page="listWebsitePages"
    :filters="filters"
    sort-field="title"
    :sortable="WEBSITE_PAGE_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="website-pages"
    :extra-fields="['title']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a page title or slug…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-file" />
        <p v-if="filters.search">No page matches “{{ filters.search }}”.</p>
        <p v-else>No page yet.</p>
      </div>
    </template>

    <Field name="title" label="Title" sortable />

    <Field name="slug" label="Slug" sortable>
      <template #default="{ value }">
        <span class="page-cell__slug">/{{ value }}</span>
      </template>
    </Field>

    <Field name="is_published" label="Published" sortable :width="12">
      <template #default="{ value }">
        <Tag :value="value ? 'Published' : 'Draft'" :severity="value ? 'success' : 'secondary'" />
      </template>
    </Field>

    <template #actions="{ row }">
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
        label="Delete this page?"
        :message="`“${row.title}” will be removed from the website.`"
        @confirm="remove(row)"
      />
    </template>
  </ListView>
</template>

<style scoped>
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

/* A URL part is not prose: it reads character by character. */
.page-cell__slug {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  word-break: break-all;
}
</style>

<script setup lang="ts">
/*
 * The website page table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/list/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/list/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
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

const confirm = useConfirm()

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

const {
  rows,
  total,
  loading,
  error,
  first,
  pageSize,
  sortField,
  sortOrder,
  isInitialLoad,
  onPage,
  onSort,
  reload,
} = useResourceList({
  fetchPage: listWebsitePages,
  filters,
  pageSize: props.pageSize,
  sortField: 'title',
  syncUrl: props.syncUrl,
  sortable: WEBSITE_PAGE_SORTABLE,
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as WebsitePageRow,
)

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
    reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This page could not be deleted.'
  }
}

function askDelete(row: WebsitePageRow): void {
  confirm.require({
    header: 'Delete this page?',
    message: `“${row.title}” will be removed from the website.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => {
      void remove(row)
    },
  })
}

// On `loading` going false rather than on `total`: a reload landing on the same
// count must still be reported.
watch(loading, (busy) => {
  if (!busy && !error.value) emit('loaded', total.value)
})

defineExpose({ reload })
</script>

<template>
  <Message v-if="error" severity="error" :closable="false" class="page__message">
    <div class="list__error">
      <span>{{ error }}</span>
      <Button label="Retry" size="small" severity="danger" outlined @click="reload" />
    </div>
  </Message>

  <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
    {{ deleteError }}
  </Message>

  <DataTable
    lazy
    paginator
    row-hover
    data-key="id"
    removable-sort
    :value="isInitialLoad ? skeletonRows : rows"
    :total-records="total"
    :first="first"
    :rows="pageSize"
    :rows-per-page-options="[10, 20, 50, 100]"
    :sort-field="sortField ?? undefined"
    :sort-order="sortOrder"
    paginator-template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
    current-page-report-template="{first}–{last} of {totalRecords}"
    @page="onPage"
    @sort="onSort"
  >
    <template #header>
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

    <Column field="title" header="Title" sortable style="min-width: 16rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <span v-else>{{ data.title }}</span>
      </template>
    </Column>

    <Column field="slug" header="Slug" sortable style="min-width: 14rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else class="page-cell__slug">/{{ data.slug }}</span>
      </template>
    </Column>

    <Column field="is_published" header="Published" sortable style="width: 10rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1.5rem" />
        <Tag
          v-else
          :value="data.is_published ? 'Published' : 'Draft'"
          :severity="data.is_published ? 'success' : 'secondary'"
        />
      </template>
    </Column>

    <Column style="width: 6rem" body-class="row-actions">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" width="2rem" shape="circle" />
        <!-- A <div> of our own rather than styling the cell: `body-class` lands on
             a <td> PrimeVue renders, which a scoped rule never reaches -- that is
             how the two buttons ended up stacked in a 6rem column. -->
        <div v-else class="row-actions__buttons">
          <Button
            v-if="canUpdate"
            icon="pi pi-pencil"
            text
            rounded
            severity="secondary"
            aria-label="Edit"
            @click="emit('open', data.id)"
          />
          <Button
            v-if="canDelete"
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            aria-label="Delete"
            @click="askDelete(data)"
          />
        </div>
      </template>
    </Column>
  </DataTable>
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

.row-actions__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.list__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

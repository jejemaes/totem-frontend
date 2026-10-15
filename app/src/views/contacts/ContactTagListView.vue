<script setup lang="ts">
/*
 * The contact tag table, with its filter bar -- and NOTHING that ties it to a
 * route: no useRoute, no RouterLink, no page header. That is what lets the same
 * table sit on /contact-tags and inside a Dialog. Navigation is the caller's
 * call: the view only says "this row was opened", and the page decides that
 * means a route push carrying the query string along.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, watch } from 'vue'

import { can } from '@/auth/permissions'
import ColorDot from '@/components/ColorDot.vue'
import MultiRecordFilters from '@/components/list/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/list/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
import {
  CONTACT_TAG_SORTABLE,
  listContactTags,
  type ContactTagFilters,
  type ContactTagRow,
} from '@/resources/contactTags'

const props = withDefaults(
  defineProps<{
    /**
     * Mirror page, sort and filters in the query string. ONLY the routed page
     * turns this on: a table in a modal writing the host page's URL would
     * fight that page's own list over the same keys.
     */
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
const canUpdate = computed(() => can('totem.contacttag.update'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL -- one name, so a link is
 * always a faithful description of the request behind it.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the tag name, case-insensitive.',
  },
  name: {
    type: 'string',
    label: 'Name',
    help_text: 'Filter on the tag name.',
  },
}

// `syncUrl` passed EXPLICITLY: useFilter defaults to reading the URL, so
// leaving it out would make a modal table pick up the host page's filters.
const { filters, setFilters, updateFilters, activeFilters } = useFilter<ContactTagFilters>(
  FILTER_FIELDS,
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
  fetchPage: listContactTags,
  filters,
  pageSize: props.pageSize,
  sortField: 'name',
  syncUrl: props.syncUrl,
  sortable: CONTACT_TAG_SORTABLE,
})

// On `loading` going false rather than on `total`: a reload that lands on the
// same count must still be reported, or a caller's "loading..." never clears.
watch(loading, (busy) => {
  if (!busy && !error.value) emit('loaded', total.value)
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as ContactTagRow,
)

defineExpose({ reload })
</script>

<template>
  <Message v-if="error" severity="error" :closable="false" class="page__message">
    <div class="list__error">
      <span>{{ error }}</span>
      <Button label="Retry" size="small" severity="danger" outlined @click="reload" />
    </div>
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
        search-placeholder="Search a tag name…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-tags" />
        <p v-if="filters.search">No tag matches “{{ filters.search }}”.</p>
        <p v-else>No tag yet.</p>
      </div>
    </template>

    <Column field="name" header="Name" sortable style="min-width: 16rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <span class="contact-cell__name">{{ data.name }}</span>
      </template>
    </Column>

    <Column field="color" header="Colour" sortable style="width: 10rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <div v-else class="colour-cell">
          <ColorDot :color="data.color" />
        </div>
      </template>
    </Column>

    <Column style="width: 4rem" body-class="row-actions">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" width="2rem" shape="circle" />
        <Button
          v-else-if="canUpdate"
          icon="pi pi-pencil"
          text
          rounded
          severity="secondary"
          aria-label="Edit"
          @click="emit('open', data.id)"
        />
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

.colour-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.row-actions {
  text-align: right;
}

.list__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

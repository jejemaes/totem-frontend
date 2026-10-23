<script setup lang="ts">
/*
 * The website menu table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import DeleteButton from '@/components/list/DeleteButton.vue'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
import {
  deleteWebsiteMenu,
  listWebsiteMenus,
  searchWebsiteMenus,
  WEBSITE_MENU_SORTABLE,
  websiteMenuDisplayNames,
  type WebsiteMenuFilters,
  type WebsiteMenuRow,
} from '@/resources/websiteMenus'
import {
  displayPage,
  searchWebsitePages,
  websitePageDisplayNames,
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
const canUpdate = computed(() => can('totem.websitemenu.update'))
const canDelete = computed(() => can('totem.websitemenu.delete'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL -- one name, so a link is
 * always a faithful description of the request behind it.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the name or the link.',
  },
  name: {
    type: 'string',
    label: 'Name',
    help_text: 'Filter on the menu name.',
  },
  parent: {
    type: 'many2one',
    label: 'Parent',
    help_text: 'Keep the direct children of one menu item.',
    // The same loader the menu form's own parent field uses: the endpoint and
    // its `?fields=` list belong to the resource module, not here. `resolve`
    // labels a parent restored from the URL, which arrives as a bare id.
    options: {
      fetch: searchWebsiteMenus,
      resolve: websiteMenuDisplayNames,
      permission: 'totem.websitemenu.read',
    },
  },
  target_page: {
    type: 'many2one',
    label: 'Target page',
    help_text: 'Keep the items pointing at one page.',
    options: {
      fetch: searchWebsitePages,
      resolve: websitePageDisplayNames,
      // A page has a `title`, not a `name`: the generic label would be its id.
      relationDisplay: displayPage,
      permission: 'totem.websitepage.read',
    },
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<WebsiteMenuFilters>(
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
  fetchPage: listWebsiteMenus,
  filters,
  pageSize: props.pageSize,
  // The backend's own default ordering, and the only one a menu is read in.
  sortField: 'sequence',
  syncUrl: props.syncUrl,
  sortable: WEBSITE_MENU_SORTABLE,
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as WebsiteMenuRow,
)

const deleteError = ref<string | null>(null)

/**
 * `parent` is `on_delete=PROTECT`, so an item with children cannot be removed.
 * The refusal is shown as-is: the backend names the reason better than a
 * generic message would.
 */
async function remove(row: WebsiteMenuRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteWebsiteMenu(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This menu item could not be deleted.'
  }
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
        search-placeholder="Search a menu name or link…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-sitemap" />
        <p v-if="filters.search">No menu item matches “{{ filters.search }}”.</p>
        <p v-else>No menu item yet.</p>
      </div>
    </template>

    <Column field="name" header="Name" sortable style="min-width: 14rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <span v-else>{{ data.name }}</span>
      </template>
    </Column>

    <!-- Not sortable: the backend orders through `model._meta.get_field()`,
         which a relation would not survive. -->
    <Column field="page" header="Page" style="min-width: 12rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.page">{{ data.page.title }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Column>

    <Column field="link" header="Link" style="min-width: 12rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.link" class="menu-cell__link">{{ data.link }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Column>

    <Column field="sequence" header="Sequence" sortable style="width: 8rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else>{{ data.sequence }}</span>
      </template>
    </Column>

    <Column field="parent" header="Parent" style="min-width: 12rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.parent">{{ data.parent.name }}</span>
        <span v-else class="muted">—</span>
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
          <DeleteButton
            v-if="canDelete"
            label="Delete this menu item?"
            :message="`“${data.name}” will be removed from the website menu.`"
            @confirm="remove(data)"
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

/* A URL is not prose: it must be readable character by character, and it must
   not stretch the column. */
.menu-cell__link {
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

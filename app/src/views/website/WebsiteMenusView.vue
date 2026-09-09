<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/list/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/list/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
import {
  deleteWebsiteMenu,
  listWebsiteMenus,
  searchWebsiteMenus,
  WEBSITE_MENU_SORTABLE,
  type WebsiteMenuFilters,
  type WebsiteMenuRow,
} from '@/resources/websiteMenus'
import { searchWebsitePages } from '@/resources/websitePages'

const route = useRoute()
const confirm = useConfirm()

/** Computeds, not bare `can()` calls: see ContactsView. */
const canCreate = computed(() => can('totem.websitemenu.create'))
const canUpdate = computed(() => can('totem.websitemenu.update'))
const canDelete = computed(() => can('totem.websitemenu.delete'))

function editRoute(id: string) {
  return { name: 'website-menu-edit', params: { id }, query: route.query }
}

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
    // its `?fields=` list belong to the resource module, not here.
    options: { fetch: searchWebsiteMenus, permission: 'totem.websitemenu.read' },
  },
  target_page: {
    type: 'many2one',
    label: 'Target page',
    help_text: 'Keep the items pointing at one page.',
    options: { fetch: searchWebsitePages, permission: 'totem.websitepage.read' },
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<WebsiteMenuFilters>(
  FILTER_FIELDS,
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
  pageSize: 10,
  // The backend's own default ordering, and the only one a menu is read in.
  sortField: 'sequence',
  syncUrl: true,
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

function askDelete(row: WebsiteMenuRow): void {
  confirm.require({
    header: 'Delete this menu item?',
    message: `“${row.name}” will be removed from the website menu.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => {
      void remove(row)
    },
  })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Website menus</h1>
        <p class="page__subtitle">
          <template v-if="!loading">{{ total }} item{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" to="/website/menus/new">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      <div class="page__error">
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
          <template v-else>
            <RouterLink v-if="canUpdate" :to="editRoute(data.id)">
              <Button icon="pi pi-pencil" text rounded severity="secondary" aria-label="Edit" />
            </RouterLink>
            <Button
              v-if="canDelete"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              aria-label="Delete"
              @click="askDelete(data)"
            />
          </template>
        </template>
      </Column>
    </DataTable>
  </section>
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

.row-actions {
  text-align: right;
  white-space: nowrap;
}

.page__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

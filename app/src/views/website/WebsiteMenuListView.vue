<script setup lang="ts">
/*
 * The website menu table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
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

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

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
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This menu item could not be deleted.'
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
    :fetch-page="listWebsiteMenus"
    :filters="filters"
    sort-field="sequence"
    :sortable="WEBSITE_MENU_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="website-menus"
    :extra-fields="['name']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
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

    <Field name="name" label="Name" sortable />

    <!-- Not sortable: the backend orders through `model._meta.get_field()`,
         which a relation would not survive. A page has a `title`, not a
         `name`: without `displayPage` the cell would show its id. -->
    <Field name="page" widget="many2one" label="Page" :options="{ relationDisplay: displayPage }" />

    <Field name="link" label="Link">
      <template #default="{ value }">
        <span v-if="value" class="menu-cell__link">{{ value }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Field>

    <Field name="sequence" widget="integer" label="Sequence" sortable :width="10" />

    <Field name="parent" widget="many2one" label="Parent" />

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
        label="Delete this menu item?"
        :message="`“${row.name}” will be removed from the website menu.`"
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

/* A URL is not prose: it must be readable character by character, and it must
   not stretch the column. */
.menu-cell__link {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  word-break: break-all;
}
</style>

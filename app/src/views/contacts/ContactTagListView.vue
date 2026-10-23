<script setup lang="ts">
/*
 * The contact tag table, with its filter bar -- and NOTHING that ties it to a
 * route: no useRoute, no RouterLink, no page header. That is what lets the same
 * table sit on /contact-tags and inside a Dialog. Navigation is the caller's
 * call: the view only says "this row was opened", and the page decides that
 * means a route push carrying the query string along.
 *
 * The table itself is a <ListView>: this file declares the filters, the
 * columns and the row's buttons, and nothing of the paging, sorting, column
 * menu or error handling, which every list shares.
 */
import Button from 'primevue/button'
import { computed, useTemplateRef } from 'vue'

import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import Field from '@/components/list/Field.vue'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  CONTACT_TAG_SORTABLE,
  listContactTags,
  type ContactTagFilters,
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

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

defineExpose({ reload: (): Promise<void> => list.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <ListView
    ref="list"
    :fetch-page="listContactTags"
    :filters="filters"
    sort-field="name"
    :sortable="CONTACT_TAG_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="contact-tags"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
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

    <Field name="name" label="Name" sortable />
    <Field name="color" widget="color" label="Colour" sortable :width="15" />

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
</style>

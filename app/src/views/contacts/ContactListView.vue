<script setup lang="ts">
/*
 * The contact table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, watch } from 'vue'

import { can } from '@/auth/permissions'
import ColorTag from '@/components/ColorTag.vue'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import { useFilter } from '@/composables/useFilter'
import { useResourceList } from '@/composables/useResourceList'
import {
  CONTACT_SORTABLE,
  displayName,
  initials,
  listContacts,
  type ContactFilters,
  type ContactRow,
} from '@/resources/contacts'
import { contactTagDisplayNames, searchContactTags } from '@/resources/contactTags'
import { countryDisplayNames, searchCountries } from '@/resources/countries'

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


/**
 * The actions are hidden without their scope, like the menu entries. Computeds
 * rather than direct calls from the template: `can()` instantiates the store on
 * every evaluation, and the pencil is evaluated once per row.
 */
const canUpdate = computed(() => can('totem.contact.update'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL -- one name, so a link is
 * always a faithful description of the request behind it.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the first name, the last name or the email.',
  },
  email: {
    type: 'string',
    label: 'Email',
    help_text: 'Filter on the email address.',
  },
  city: {
    type: 'string',
    label: 'City',
    help_text: 'Filter on the city.',
  },
  country: {
    type: 'many2one',
    label: 'Country',
    help_text: 'Keep the contacts of one country.',
    // The same loader the contact form's own country field uses: the endpoint,
    // its `?fields=` list and the name of its search parameter all belong to
    // the resource module, not here. `resolve` labels a country restored from
    // the URL, which arrives as a bare code.
    options: {
      fetch: searchCountries,
      resolve: countryDisplayNames,
      permission: 'totem.country.read',
    },
  },
  tag: {
    type: 'many2one',
    label: 'Tag',
    help_text: 'Keep the contacts carrying this tag.',
    options: {
      fetch: searchContactTags,
      resolve: contactTagDisplayNames,
      permission: 'totem.contacttag.read',
    },
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<ContactFilters>(
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
  fetchPage: listContacts,
  filters,
  pageSize: props.pageSize,
  // The backend's own default ordering, so the first page matches what a
  // parameter-less request would return.
  sortField: 'last_name',
  syncUrl: props.syncUrl,
  sortable: CONTACT_SORTABLE,
})

/** Placeholder rows so the first paint has the table's real height. */
const skeletonRows = Array.from({ length: 5 }, (_, i) => ({ id: `skeleton-${i}` }) as ContactRow)

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
        search-placeholder="Search a name or an email…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-address-book" />
        <p v-if="filters.search">No contact matches “{{ filters.search }}”.</p>
        <p v-else>No contact yet.</p>
      </div>
    </template>

    <Column field="last_name" header="Name" sortable style="min-width: 16rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="2rem" />
        <div v-else class="contact-cell">
          <Avatar :label="initials(data)" shape="circle" />
          <span class="contact-cell__name">{{ displayName(data) }}</span>
        </div>
      </template>
    </Column>

    <Column field="email" header="Email" sortable style="min-width: 14rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <a v-else-if="data.email" :href="`mailto:${data.email}`" class="link">{{ data.email }}</a>
        <span v-else class="muted">—</span>
      </template>
    </Column>

    <!-- `mobile` is not in the backend's ordering whitelist, so no `sortable`. -->
    <Column header="Mobile" style="min-width: 10rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <a v-else-if="data.mobile" :href="`tel:${data.mobile}`" class="link">{{ data.mobile }}</a>
        <span v-else class="muted">—</span>
      </template>
    </Column>

    <Column field="city" header="City" sortable style="min-width: 10rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <span v-else-if="data.city">{{ data.city }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Column>

    <!-- A relation: the backend cannot order on it. -->
    <Column header="Tags" style="min-width: 12rem">
      <template #body="{ data }">
        <Skeleton v-if="isInitialLoad" height="1rem" />
        <div v-else-if="data.tags?.length" class="tags">
          <ColorTag
            v-for="tag in data.tags"
            :key="tag.id"
            :label="tag.name"
            :color="tag.color"
          />
        </div>
        <span v-else class="muted">None</span>
      </template>
    </Column>

    <!-- Row actions: no header, the icon speaks for itself. -->
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
.contact-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.contact-cell__name {
  font-weight: 500;
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

.link {
  color: var(--p-primary-color);
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

<script setup lang="ts">
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { can } from '@/auth/permissions'
import ColorTag from '@/components/ColorTag.vue'
import MultiRecordFilters from '@/components/list/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/list/filters'
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
import { searchContactTags } from '@/resources/contactTags'
import { searchCountries } from '@/resources/countries'

const route = useRoute()

/**
 * The actions are hidden without their scope, like the menu entries. Computeds
 * rather than direct calls from the template: `can()` instantiates the store on
 * every evaluation, and the pencil is evaluated once per row.
 */
const canCreate = computed(() => can('totem.contact.create'))
const canUpdate = computed(() => can('totem.contact.update'))

/**
 * The edit link carries the list's own query (page, ordering, search) so the
 * form can send the user back to the list they actually left.
 */
function editRoute(id: string) {
  return { name: 'contact-edit', params: { id }, query: route.query }
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
    // the resource module, not here.
    options: { fetch: searchCountries, permission: 'totem.country.read' },
  },
  tag: {
    type: 'many2one',
    label: 'Tag',
    help_text: 'Keep the contacts carrying this tag.',
    options: { fetch: searchContactTags, permission: 'totem.contacttag.read' },
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<ContactFilters>(
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
  fetchPage: listContacts,
  filters,
  pageSize: 10,
  // The backend's own default ordering, so the first page matches what a
  // parameter-less request would return.
  sortField: 'last_name',
  syncUrl: true,
  sortable: CONTACT_SORTABLE,
})

/** Placeholder rows so the first paint has the table's real height. */
const skeletonRows = Array.from({ length: 5 }, (_, i) => ({ id: `skeleton-${i}` }) as ContactRow)
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Contacts</h1>
        <p class="page__subtitle">
          <template v-if="!loading">{{ total }} contact{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" to="/contacts/new">
        <Button label="New" icon="pi pi-plus" />
      </RouterLink>
    </header>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      <div class="page__error">
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
          <RouterLink v-else-if="canUpdate" :to="editRoute(data.id)">
            <Button icon="pi pi-pencil" text rounded severity="secondary" aria-label="Edit" />
          </RouterLink>
        </template>
      </Column>
    </DataTable>
  </section>
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

.page__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

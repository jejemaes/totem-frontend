<script setup lang="ts">
/*
 * The contact table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import { computed, useTemplateRef } from 'vue'

import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
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

/** A <Field> slot is handed a generic row: the helpers below want a contact. */
function contact(row: ListRow): ContactRow {
  return row as ContactRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

defineExpose({ reload: (): Promise<void> => list.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <ListView
    ref="list"
    :fetch-page="listContacts"
    :filters="filters"
    sort-field="last_name"
    :sortable="CONTACT_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="contacts"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
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

    <!-- Sorted on `last_name`, the backend's own default ordering; the cell
         reads both names. -->
    <Field name="last_name" label="Name" sortable :fields="['first_name', 'last_name']">
      <template #default="{ row }">
        <div class="contact-cell">
          <Avatar :label="initials(contact(row))" shape="circle" />
          <span class="contact-cell__name">{{ displayName(contact(row)) }}</span>
        </div>
      </template>
    </Field>

    <Field name="email" label="Email" sortable>
      <template #default="{ value }">
        <a v-if="value" :href="`mailto:${value}`" class="link">{{ value }}</a>
        <span v-else class="muted">—</span>
      </template>
    </Field>

    <!-- `mobile` is not in the backend's ordering whitelist, so no `sortable`. -->
    <Field name="mobile" label="Mobile">
      <template #default="{ value }">
        <a v-if="value" :href="`tel:${value}`" class="link">{{ value }}</a>
        <span v-else class="muted">—</span>
      </template>
    </Field>

    <Field name="city" label="City" sortable />

    <!-- A relation: the backend cannot order on it. -->
    <Field name="tags" widget="many2many_tags" label="Tags" />

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
</style>

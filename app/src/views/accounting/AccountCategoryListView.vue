<script setup lang="ts">
/*
 * The accounting category table, with its filter bar -- and NOTHING that ties
 * it to a route. See ContactTagListView for the contract in full.
 *
 * The `account` filter is the OWNER, not `applicable_to`: this screen manages
 * categories, so "the ones belonging to BANK" is the question, and mixing the
 * general ones in would make every account look like it owns them.
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
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  ACCOUNT_CATEGORY_SORTABLE,
  deleteAccountCategory,
  listAccountCategories,
  type AccountCategoryFilters,
  type AccountCategoryRow,
} from '@/resources/accountCategories'
import { accountDisplayNames, displayAccount, searchAccounts } from '@/resources/accounts'

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
const canUpdate = computed(() => can('totem.accountcategory.update'))
const canDelete = computed(() => can('totem.accountcategory.delete'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the category name.',
  },
  account: {
    type: 'many2one',
    label: 'Account',
    help_text: 'Keep the categories owned by this account. General ones are left out.',
    options: {
      fetch: searchAccounts,
      resolve: accountDisplayNames,
      relationDisplay: displayAccount,
      permission: 'totem.account.read',
    },
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<AccountCategoryFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A <Field> slot is handed a generic row: the helpers below want a category. */
function category(row: ListRow): AccountCategoryRow {
  return row as AccountCategoryRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

const deleteError = ref<string | null>(null)

async function remove(row: AccountCategoryRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteAccountCategory(row.id)
    // The 404 recovery in useResourceList covers the case where that row was
    // the last one of the last page.
    void list.value?.reload()
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This category could not be deleted.'
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
    :fetch-page="listAccountCategories"
    :filters="filters"
    sort-field="name"
    :sortable="ACCOUNT_CATEGORY_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="account-categories"
    :extra-fields="['name']"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Search a category name…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-tags" />
        <p v-if="filters.search">No category matches “{{ filters.search }}”.</p>
        <p v-else>No category yet.</p>
      </div>
    </template>

    <Field name="name" label="Name" sortable />

    <Field name="color" widget="color" label="Colour" sortable :width="10" />

    <Field name="account" label="Account">
      <template #default="{ row }">
        <span v-if="category(row).account">{{ displayAccount(category(row).account!) }}</span>
        <!-- No owner means usable everywhere: say so rather than leave a hole. -->
        <span v-else class="category-cell__general">General</span>
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
      <!-- SET_NULL on the movement side: worth saying, since nothing else warns. -->
      <DeleteButton
        v-if="canDelete"
        label="Delete this category?"
        :message="`“${row.name}” will be removed. Its movements are kept, uncategorised.`"
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

.category-cell__general {
  color: var(--app-muted);
  font-style: italic;
}
</style>

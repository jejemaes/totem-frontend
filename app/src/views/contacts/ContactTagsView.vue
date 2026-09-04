<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { computed, reactive } from 'vue'
import { useRoute } from 'vue-router'

import { can } from '@/auth/permissions'
import { colorAt } from '@/components/form/fields/colors'
import { useResourceList } from '@/composables/useResourceList'
import {
  CONTACT_TAG_SORTABLE,
  listContactTags,
  type ContactTagRow,
} from '@/resources/contactTags'

const route = useRoute()

/** Computeds, not bare `can()` calls: see ContactsView. */
const canCreate = computed(() => can('totem.contacttag.create'))
const canUpdate = computed(() => can('totem.contacttag.update'))

function editRoute(id: string) {
  return { name: 'contact-tag-edit', params: { id }, query: route.query }
}

const filters = reactive({ search: '' })

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
  pageSize: 10,
  sortField: 'name',
  syncUrl: true,
  sortable: CONTACT_TAG_SORTABLE,
})

const skeletonRows = Array.from(
  { length: 5 },
  (_, i) => ({ id: `skeleton-${i}` }) as ContactTagRow,
)
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Contact tags</h1>
        <p class="page__subtitle">
          <template v-if="!loading">{{ total }} tag{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <RouterLink v-if="canCreate" to="/contact-tags/new">
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
        <div class="table-toolbar">
          <IconField class="table-toolbar__search">
            <InputIcon class="pi pi-search" />
            <InputText v-model="filters.search" placeholder="Search a tag name…" />
          </IconField>
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            aria-label="Refresh"
            :loading="loading"
            @click="reload"
          />
        </div>
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
            <span class="colour-cell__swatch" :style="{ backgroundColor: colorAt(data.color) }" />
          </div>
        </template>
      </Column>

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
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.table-toolbar__search {
  flex: 1;
  max-width: 24rem;
}

.table-toolbar__search :deep(input) {
  width: 100%;
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

.colour-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.colour-cell__swatch {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  border: 1px solid var(--p-content-border-color, rgb(0 0 0 / 15%));
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

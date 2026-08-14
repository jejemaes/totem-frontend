<script setup lang="ts">
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { onMounted, ref, watch } from 'vue'

import { listUsers, type UserRow } from '@/resources/users'

const rows = ref<UserRow[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

// DataTable counts in offsets, the API counts in pages. `first` is the offset of
// the first row currently displayed.
const first = ref(0)
const pageSize = ref(10)
const sortField = ref<string | null>('login')
const sortOrder = ref<1 | -1>(1)
const search = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    const page = await listUsers({
      page: Math.floor(first.value / pageSize.value) + 1,
      pageSize: pageSize.value,
      ordering: sortField.value ? `${sortOrder.value === -1 ? '-' : ''}${sortField.value}` : null,
      search: search.value.trim() || null,
    })
    rows.value = page.results
    total.value = page.count
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Chargement impossible.'
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onPage(event: DataTablePageEvent) {
  first.value = event.first
  pageSize.value = event.rows
  load()
}

function onSort(event: DataTableSortEvent) {
  sortField.value = (event.sortField as string | null) ?? null
  sortOrder.value = event.sortOrder === -1 ? -1 : 1
  // A new sort order invalidates the current page: row 41 of the old order is
  // not row 41 of the new one.
  first.value = 0
  load()
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  // Debounced: one request per pause in typing, not per keystroke.
  searchTimer = setTimeout(() => {
    // Filtering changes the result count, so a page number from the previous
    // filter can land past the last page -- which the backend answers with a
    // 404, not an empty list.
    first.value = 0
    load()
  }, 300)
})

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="page__header">
      <h1>Utilisateurs</h1>
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText v-model="search" placeholder="Rechercher…" />
      </IconField>
    </header>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      {{ error }}
    </Message>

    <DataTable
      lazy
      paginator
      :value="rows"
      :loading="loading"
      :total-records="total"
      :first="first"
      :rows="pageSize"
      :rows-per-page-options="[10, 20, 50, 100]"
      :sort-field="sortField ?? undefined"
      :sort-order="sortOrder"
      data-key="id"
      removable-sort
      @page="onPage"
      @sort="onSort"
    >
      <template #empty>
        <span v-if="!loading">Aucun utilisateur.</span>
      </template>

      <Column field="login" header="Identifiant" sortable />
      <Column field="email" header="Courriel" sortable>
        <template #body="{ data }">{{ data.email ?? '—' }}</template>
      </Column>
      <Column field="is_active" header="Statut" sortable>
        <template #body="{ data }">
          <Tag
            :severity="data.is_active ? 'success' : 'danger'"
            :value="data.is_active ? 'ACTIF' : 'INACTIF'"
          />
        </template>
      </Column>
    </DataTable>
  </section>
</template>

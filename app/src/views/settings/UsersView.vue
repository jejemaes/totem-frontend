<script setup lang="ts">
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { onMounted, ref, watch } from 'vue'

import { fullName, initials, listUsers, type UserRow } from '@/resources/users'

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

/** Placeholder rows so the first paint has the table's real height. */
const skeletonRows = Array.from({ length: 5 }, (_, i) => ({ id: `skeleton-${i}` }) as UserRow)

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
      <div>
        <h1>Utilisateurs</h1>
        <p class="page__subtitle">
          <template v-if="!loading">{{ total }} compte{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>
    </header>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      <div class="page__error">
        <span>{{ error }}</span>
        <Button label="Réessayer" size="small" severity="danger" outlined @click="load" />
      </div>
    </Message>

    <DataTable
      lazy
      paginator
      row-hover
      data-key="id"
      removable-sort
      :value="loading && !rows.length ? skeletonRows : rows"
      :total-records="total"
      :first="first"
      :rows="pageSize"
      :rows-per-page-options="[10, 20, 50, 100]"
      :sort-field="sortField ?? undefined"
      :sort-order="sortOrder"
      paginator-template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
      current-page-report-template="{first}–{last} sur {totalRecords}"
      @page="onPage"
      @sort="onSort"
    >
      <template #header>
        <div class="table-toolbar">
          <IconField class="table-toolbar__search">
            <InputIcon class="pi pi-search" />
            <InputText v-model="search" placeholder="Rechercher un identifiant ou un courriel…" />
          </IconField>
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            aria-label="Rafraîchir"
            :loading="loading"
            @click="load"
          />
        </div>
      </template>

      <template #empty>
        <div class="table-empty">
          <i class="pi pi-users" />
          <p v-if="search">Aucun utilisateur ne correspond à « {{ search }} ».</p>
          <p v-else>Aucun utilisateur.</p>
        </div>
      </template>

      <Column field="login" header="Utilisateur" sortable style="min-width: 16rem">
        <template #body="{ data }">
          <Skeleton v-if="loading && !rows.length" height="2rem" />
          <div v-else class="user-cell">
            <Avatar :label="initials(data)" shape="circle" />
            <div class="user-cell__text">
              <span class="user-cell__login">{{ data.login }}</span>
              <span v-if="fullName(data)" class="user-cell__name">{{ fullName(data) }}</span>
            </div>
          </div>
        </template>
      </Column>

      <Column field="email" header="Courriel" sortable style="min-width: 14rem">
        <template #body="{ data }">
          <Skeleton v-if="loading && !rows.length" height="1rem" />
          <a v-else-if="data.email" :href="`mailto:${data.email}`" class="link">{{ data.email }}</a>
          <span v-else class="muted">—</span>
        </template>
      </Column>

      <!-- `roles` is not in the backend's ordering whitelist, so no `sortable`. -->
      <Column header="Rôles" style="min-width: 12rem">
        <template #body="{ data }">
          <Skeleton v-if="loading && !rows.length" height="1rem" />
          <div v-else-if="data.roles?.length" class="tags">
            <Tag v-for="role in data.roles" :key="role.id" :value="role.name" severity="info" />
          </div>
          <span v-else class="muted">Aucun</span>
        </template>
      </Column>

      <Column field="is_active" header="Statut" sortable style="width: 9rem">
        <template #body="{ data }">
          <Skeleton v-if="loading && !rows.length" height="1rem" />
          <Tag
            v-else
            :severity="data.is_active ? 'success' : 'danger'"
            :value="data.is_active ? 'Actif' : 'Inactif'"
          />
        </template>
      </Column>
    </DataTable>
  </section>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.table-toolbar__search {
  flex: 1;
  max-width: 24rem;
}

.table-toolbar__search :deep(input) {
  width: 100%;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-cell__text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.user-cell__login {
  font-weight: 600;
}

.user-cell__name {
  font-size: 0.85rem;
  color: var(--app-muted);
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1rem;
  color: var(--app-muted);
}

.table-empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.table-empty p {
  margin: 0;
}

.link {
  color: var(--p-primary-color);
}

.link:hover {
  text-decoration: underline;
}

.page__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>

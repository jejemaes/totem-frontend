<script setup lang="ts">
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { reactive } from 'vue'

import { useResourceList } from '@/composables/useResourceList'
import { fullName, initials, listUsers, USER_SORTABLE, type UserRow } from '@/resources/users'

/** Every key is sent as a query param; any change resets to page 1. */
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
  fetchPage: listUsers,
  filters,
  pageSize: 10,
  sortField: 'login',
  syncUrl: true,
  sortable: USER_SORTABLE,
})

/** Placeholder rows so the first paint has the table's real height. */
const skeletonRows = Array.from({ length: 5 }, (_, i) => ({ id: `skeleton-${i}` }) as UserRow)
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
        <Button label="Réessayer" size="small" severity="danger" outlined @click="reload" />
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
      current-page-report-template="{first}–{last} sur {totalRecords}"
      @page="onPage"
      @sort="onSort"
    >
      <template #header>
        <div class="table-toolbar">
          <IconField class="table-toolbar__search">
            <InputIcon class="pi pi-search" />
            <InputText v-model="filters.search" placeholder="Rechercher un identifiant ou un courriel…" />
          </IconField>
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            aria-label="Rafraîchir"
            :loading="loading"
            @click="reload"
          />
        </div>
      </template>

      <template #empty>
        <div class="table-empty">
          <i class="pi pi-users" />
          <p v-if="filters.search">Aucun utilisateur ne correspond à « {{ filters.search }} ».</p>
          <p v-else>Aucun utilisateur.</p>
        </div>
      </template>

      <Column field="login" header="Utilisateur" sortable style="min-width: 16rem">
        <template #body="{ data }">
          <Skeleton v-if="isInitialLoad" height="2rem" />
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
          <Skeleton v-if="isInitialLoad" height="1rem" />
          <a v-else-if="data.email" :href="`mailto:${data.email}`" class="link">{{ data.email }}</a>
          <span v-else class="muted">—</span>
        </template>
      </Column>

      <!-- `roles` is not in the backend's ordering whitelist, so no `sortable`. -->
      <Column header="Rôles" style="min-width: 12rem">
        <template #body="{ data }">
          <Skeleton v-if="isInitialLoad" height="1rem" />
          <div v-else-if="data.roles?.length" class="tags">
            <Tag v-for="role in data.roles" :key="role.id" :value="role.name" severity="info" />
          </div>
          <span v-else class="muted">Aucun</span>
        </template>
      </Column>

      <Column field="is_active" header="Statut" sortable style="width: 9rem">
        <template #body="{ data }">
          <Skeleton v-if="isInitialLoad" height="1rem" />
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


<script setup lang="ts">
/*
 * The user account table, with its filter bar -- and NOTHING that ties it to a route:
 * no useRoute, no RouterLink, no page header. The routed page decides what
 * opening a row means; a Dialog can decide something else. See
 * ContactTagListView for the contract in full.
 */
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { computed, useTemplateRef } from 'vue'

import { can } from '@/auth/permissions'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import type { FilterFields } from '@/components/filters/filters'
import Field from '@/components/list/Field.vue'
import type { ListRow } from '@/components/list/fields/types'
import ListView from '@/components/list/ListView.vue'
import { useFilter } from '@/composables/useFilter'
import {
  fullName,
  initials,
  listUsers,
  USER_SORTABLE,
  type UserFilters,
  type UserRow,
} from '@/resources/users'

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
 * The actions are hidden without their scope, like the menu entries: hiding
 * what would answer 403 is a convenience, the actual barrier is the route
 * guard.
 *
 * Computeds rather than direct calls from the template: `can()` instantiates
 * the store on every evaluation, and the pencil is evaluated once per row.
 */
const canUpdate = computed(() => can('totem.user.update'))

/**
 * The filters this screen offers. The key of each entry is the query parameter
 * the API takes and the one that ends up in the URL -- one name, so a link is
 * always a faithful description of the request behind it.
 */
const FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the login or the email.',
  },
  login: {
    type: 'string',
    label: 'Login',
    help_text: 'Filter on the login.',
  },
  email: {
    type: 'string',
    label: 'Email',
    help_text: 'Filter on the email address.',
  },
  is_active: {
    type: 'boolean',
    label: 'Active',
    help_text: 'Keep the active accounts, or the deactivated ones.',
  },
}

const { filters, setFilters, updateFilters, activeFilters } = useFilter<UserFilters>(
  FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A <Field> slot is handed a generic row: the helpers below want a user. */
function user(row: ListRow): UserRow {
  return row as UserRow
}

const list = useTemplateRef<{ reload(): Promise<void> }>('list')

defineExpose({ reload: (): Promise<void> => list.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <ListView
    ref="list"
    :fetch-page="listUsers"
    :filters="filters"
    sort-field="login"
    :sortable="USER_SORTABLE"
    :page-size="pageSize"
    :sync-url="syncUrl"
    storage-key="users"
    @loaded="emit('loaded', $event)"
  >
    <template #header="{ loading, reload }">
      <MultiRecordFilters
        :fields="FILTER_FIELDS"
        :filters="filters"
        :active-filters="activeFilters"
        :loading="loading"
        search-placeholder="Rechercher un identifiant ou un courriel…"
        @apply="setFilters"
        @patch="updateFilters"
        @refresh="reload"
      />
    </template>

    <template #empty>
      <div class="table-empty">
        <i class="pi pi-users" />
        <p v-if="filters.search">Aucun utilisateur ne correspond à « {{ filters.search }} ».</p>
        <p v-else>Aucun utilisateur.</p>
      </div>
    </template>

    <Field name="login" label="Utilisateur" sortable :fields="['login', 'first_name', 'last_name']">
      <template #default="{ row }">
        <div class="user-cell">
          <Avatar :label="initials(user(row))" shape="circle" />
          <div class="user-cell__text">
            <span class="user-cell__login">{{ row.login }}</span>
            <span v-if="fullName(user(row))" class="user-cell__name">{{ fullName(user(row)) }}</span>
          </div>
        </div>
      </template>
    </Field>

    <Field name="email" label="Courriel" sortable>
      <template #default="{ value }">
        <a v-if="value" :href="`mailto:${value}`" class="link">{{ value }}</a>
        <span v-else class="muted">—</span>
      </template>
    </Field>

    <!-- `roles` is not in the backend's ordering whitelist, so no `sortable`. -->
    <Field name="roles" label="Rôles">
      <template #default="{ row }">
        <div v-if="user(row).roles?.length" class="tags">
          <Tag v-for="role in user(row).roles" :key="role.id" :value="role.name" severity="info" />
        </div>
        <span v-else class="muted">Aucun</span>
      </template>
    </Field>

    <Field name="is_active" label="Statut" sortable :width="10">
      <template #default="{ value }">
        <Tag :severity="value ? 'success' : 'danger'" :value="value ? 'Actif' : 'Inactif'" />
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
    </template>
  </ListView>
</template>

<style scoped>
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
</style>

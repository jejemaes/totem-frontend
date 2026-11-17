<script setup lang="ts">
/*
 * The user accounts as cards, with the SAME filter bar as UserListView -- one
 * declaration, userFilters.ts, so a switch between the two keeps the filters.
 *
 * Router-free like every view: a click on a card emits `open`, and the page
 * decides it is a route push. The password Dialog lives HERE rather than in
 * the page: it is an action on one card, not a navigation, and a page hosting
 * this view in a Dialog would otherwise have to re-wire it. It opens from the
 * card's "⋮" menu, a record action like the form's own "Change password".
 */
import Avatar from 'primevue/avatar'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { ref, useTemplateRef } from 'vue'

import type { ActionEntry } from '@/components/actions/actions'
import CardView from '@/components/card/CardView.vue'
import Field from '@/components/card/Field.vue'
import type { CardRecord } from '@/components/card/fields/types'
import MultiRecordFilters from '@/components/filters/MultiRecordFilters.vue'
import { useFilter } from '@/composables/useFilter'
import {
  avatarUrl,
  initials,
  lastFirstName,
  listUsers,
  USER_SORTABLE,
  type UserFilters,
  type UserRow,
} from '@/resources/users'

import { USER_FILTER_FIELDS } from './userFilters'
import UserPasswordView from './UserPasswordView.vue'

const props = withDefaults(
  defineProps<{
    /** Mirror page and filters in the query string. ONLY the routed page sets it. */
    syncUrl?: boolean
    pageSize?: number
  }>(),
  { syncUrl: false, pageSize: 12 },
)

const emit = defineEmits<{
  /** A click on a card: what that means is up to the caller. */
  open: [id: string]
  /** Every settled response, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

const { filters, setFilters, updateFilters, activeFilters } = useFilter<UserFilters>(
  USER_FILTER_FIELDS,
  // EXPLICIT: useFilter reads the URL by default.
  { syncUrl: props.syncUrl },
)

/** A card slot is handed a generic record: the helpers below want a user. */
function user(record: CardRecord): UserRow {
  return record as UserRow
}

/*
 * The password Dialog, remounted per open through `passwordKey`, so a cancelled
 * attempt never leaves a password in the draft of the next -- as on UserPage.
 */
const passwordUser = ref<UserRow | null>(null)
const passwordVisible = ref(false)
const passwordKey = ref(0)
const passwordTitle = ref('')
/** Whose password was just changed: the banner names them. */
const passwordChanged = ref<string | null>(null)

function openPassword(target: UserRow): void {
  passwordChanged.value = null
  passwordUser.value = target
  passwordKey.value += 1
  passwordVisible.value = true
}

function onPasswordChanged(): void {
  passwordVisible.value = false
  passwordChanged.value = passwordUser.value ? lastFirstName(passwordUser.value) : null
}

/**
 * The "⋮" menu of each card. `totem.user.password`, NOT `totem.user.update`:
 * that is the scope the backend checks, and a role can hold the second without
 * the first -- such a user would get an entry that only ever answers 403. No
 * `reload`: opening a Dialog stores nothing.
 */
const MENU: ActionEntry<UserRow>[] = [
  {
    key: 'change-password',
    label: 'Change password',
    icon: 'pi pi-key',
    permission: 'totem.user.password',
    run: ([target]) => openPassword(target),
  },
]

const cards = useTemplateRef<{ reload(): Promise<void> }>('cards')

defineExpose({ reload: (): Promise<void> => cards.value?.reload() ?? Promise.resolve() })
</script>

<template>
  <div class="user-cards">
    <Message
      v-if="passwordChanged"
      severity="success"
      closable
      @close="passwordChanged = null"
    >
      Password changed for {{ passwordChanged }}.
    </Message>

    <CardView
      ref="cards"
      :fetch-page="listUsers"
      :filters="filters"
      sort-field="login"
      :sortable="USER_SORTABLE"
      :page-size="pageSize"
      :sync-url="syncUrl"
      :menu="MENU"
      empty-text="No user."
      @click="emit('open', String($event.id))"
      @loaded="emit('loaded', $event)"
    >
      <template #header="{ loading, reload }">
        <MultiRecordFilters
          :fields="USER_FILTER_FIELDS"
          :filters="filters"
          :active-filters="activeFilters"
          :loading="loading"
          search-placeholder="Search a login or an email…"
          @apply="setFilters"
          @patch="updateFilters"
          @refresh="reload"
        />
      </template>

      <template #empty>
        <div class="user-cards__empty">
          <i class="pi pi-users" />
          <p v-if="filters.search">No user matches “{{ filters.search }}”.</p>
          <p v-else>No user.</p>
        </div>
      </template>

      <!-- The initials, until the list route answers a URL an <img> can load:
           see avatarUrl. The names are read for the initials, hence `fields`. -->
      <template #cover>
        <Field name="avatar" :fields="['avatar', 'first_name', 'last_name', 'login']">
          <template #default="{ data, value }">
            <div class="user-cards__cover">
              <img
                v-if="avatarUrl(value)"
                :src="avatarUrl(value)!"
                :alt="lastFirstName(user(data))"
                class="user-cards__avatar user-cards__avatar--image"
                loading="lazy"
              />
              <Avatar
                v-else
                :label="initials(user(data))"
                shape="circle"
                size="xlarge"
                class="user-cards__avatar"
              />
            </div>
          </template>
        </Field>
      </template>

      <template #title>
        <Field name="last_name" :fields="['last_name', 'first_name', 'login']">
          <template #default="{ data }">{{ lastFirstName(user(data)) }}</template>
        </Field>
      </template>

      <template #subtitle>
        <Field name="login" />
      </template>

      <template #content>
        <Field name="is_active">
          <template #default="{ value }">
            <Tag :severity="value ? 'success' : 'danger'" :value="value ? 'Active' : 'Inactive'" />
          </template>
        </Field>
      </template>
    </CardView>

    <Dialog
      v-model:visible="passwordVisible"
      modal
      :header="passwordTitle"
      :style="{ width: '32rem' }"
    >
      <UserPasswordView
        v-if="passwordUser"
        :key="passwordKey"
        :user-id="passwordUser.id"
        @saved="onPasswordChanged"
        @cancel="passwordVisible = false"
        @title="passwordTitle = $event"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.user-cards {
  display: grid;
  gap: 0.75rem;
}

.user-cards__cover {
  display: grid;
  place-items: center;
  height: 7rem;
  background: var(--app-inset);
}

.user-cards__avatar {
  width: 4.5rem;
  height: 4.5rem;
}

.user-cards__avatar--image {
  border-radius: 50%;
  object-fit: cover;
}

.user-cards__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1rem;
  color: var(--app-muted);
}

.user-cards__empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.user-cards__empty p {
  margin: 0;
}
</style>

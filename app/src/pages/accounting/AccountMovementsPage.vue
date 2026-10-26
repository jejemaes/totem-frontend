<script setup lang="ts">
/*
 * /accounting/accounts/:accountId/movements: the page chrome around
 * AccountMovementListView, scoped to the account in the path.
 *
 * The account is fetched here ONLY for the heading and the balance: the list
 * filters on the id alone, so a failed fetch costs the title, never the rows.
 *
 * The view is keyed on the account: vue-router reuses this page when only the
 * param changes, and the view reads its account once -- remounting is what
 * gives it a fresh filter set and a fresh fetcher instead of the old account's.
 *
 * List or chart is `?view_type=`, owned HERE: the switcher is a plain v-model,
 * and the view shown is DERIVED from the route, so it mounts only once the URL
 * says so -- and only the mounted one writes the filters back.
 */
import Button from 'primevue/button'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import { VIEW_TYPE_KEY, viewTypeFromQuery, type ViewType } from '@/components/viewSwitcher'
import { displayAccount, fetchAccount, formatAmount, type AccountDetail } from '@/resources/accounts'
import AccountMovementChartView from '@/views/accounting/AccountMovementChartView.vue'
import AccountMovementListView from '@/views/accounting/AccountMovementListView.vue'

const route = useRoute()
const router = useRouter()

const accountId = computed(() => String(route.params.accountId))

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.accountmovement.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)
/** The chart's count, kept apart: a number of groups is not a number of movements. */
const groupCount = ref<number | null>(null)

const viewType = computed<ViewType>(() => viewTypeFromQuery(route.query))

function setViewType(view: ViewType): void {
  // `replace`, like every other key of this query string: a switch is not a
  // place to go Back to. Everything else is kept -- the filters above all.
  void router.replace({ query: { ...route.query, [VIEW_TYPE_KEY]: view } })
}
const account = ref<AccountDetail | null>(null)

// The race-ticket idiom of useResourceList: an older response landing last
// must not title the page after the previous account.
let seq = 0
let inFlight: AbortController | null = null

async function loadAccount(id: string): Promise<void> {
  const ticket = ++seq
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller
  // Cleared only when the account CHANGES: a refresh of the same one keeps the
  // heading in place instead of flashing the generic title.
  if (account.value?.id !== id) account.value = null
  try {
    const loaded = await fetchAccount(id, controller.signal)
    if (ticket === seq) account.value = loaded
  } catch {
    // Deliberately swallowed: the heading falls back to a generic one, and the
    // list below reports its own errors -- a 404 there says it better.
  }
}

watch(accountId, (id) => void loadAccount(id), { immediate: true })
onScopeDispose(() => inFlight?.abort())

const title = computed(() => (account.value ? displayAccount(account.value) : 'Movements'))

/**
 * A row deleted from the list changes the balance shown in the header. Only
 * then is the account fetched again -- not on every page or sort change, which
 * leave it as it was.
 */
function onDeleted(): void {
  void loadAccount(accountId.value)
}

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({
    name: 'accounting-account-movement-edit',
    params: { accountId: accountId.value, id },
    query: route.query,
  })
}
</script>

<template>
  <section class="page page--wide">
    <RouterLink :to="{ name: 'accounting-accounts' }" class="movements__back">
      <i class="pi pi-arrow-left" /> Accounts
    </RouterLink>

    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="page__subtitle">
          Movements<template v-if="viewType === 'list' && total !== null"> · {{ total }} movement{{ total > 1 ? 's' : '' }}</template>
          <template v-if="viewType === 'chart' && groupCount !== null"> · {{ groupCount }} group{{ groupCount > 1 ? 's' : '' }}</template>
          <template v-if="account"> · balance {{ formatAmount(account.balance) }}</template>
        </p>
      </div>

      <div class="movements__actions">
        <ViewSwitcher :model-value="viewType" @update:model-value="setViewType" />

        <RouterLink
          v-if="canCreate"
          :to="{
            name: 'accounting-account-movement-create',
            params: { accountId },
            query: route.query,
          }"
        >
          <Button label="New" icon="pi pi-plus" />
        </RouterLink>
      </div>
    </header>

    <!-- One at a time, with `v-if`: only the mounted view writes the query
         string. Keyed on the account, see above. -->
    <AccountMovementListView
      v-if="viewType === 'list'"
      :key="`list-${accountId}`"
      :account-id="accountId"
      sync-url
      @open="openRecord"
      @loaded="total = $event"
      @deleted="onDeleted"
    />
    <AccountMovementChartView
      v-else
      :key="`chart-${accountId}`"
      :account-id="accountId"
      sync-url
      @loaded="groupCount = $event"
    />
  </section>
</template>

<style scoped>
.movements__back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  color: var(--app-muted);
  text-decoration: none;
  font-size: 0.9rem;
}

.movements__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.movements__back:hover {
  color: var(--p-primary-color);
}
</style>

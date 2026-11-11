<script setup lang="ts">
/*
 * /settings/users: the page chrome around UserListView or UserCardView, and the
 * ONE place that knows what opening a record means here -- a route push. The
 * views themselves have no router, which is what lets them open in a Dialog
 * elsewhere.
 *
 * List or cards is `?view_type=`, owned HERE, as on AccountMovementsPage: the
 * switcher is a plain v-model, the view shown is derived from the route, and
 * only the mounted one writes the filters back.
 */
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import { VIEW_TYPE_KEY, viewTypeFromQuery, type ViewType } from '@/components/viewSwitcher'
import UserCardView from '@/views/settings/UserCardView.vue'
import UserListView from '@/views/settings/UserListView.vue'

const route = useRoute()
const router = useRouter()

/** A computed, not a bare `can()` call: `can()` instantiates the store each time. */
const canCreate = computed(() => can('totem.user.create'))

/** `null` until the first response: no count flashing before it is known. */
const total = ref<number | null>(null)

/** The views this page has, in the switcher's order. */
const VIEWS: readonly ViewType[] = ['list', 'card']

const viewType = computed<ViewType>(() => viewTypeFromQuery(route.query, VIEWS))

function setViewType(view: ViewType): void {
  // `replace`, like every other key of this query string: a switch is not a
  // place to go Back to. Everything else is kept -- the filters above all.
  // `page` and `page_size` go: the two views page by different sizes (10 rows,
  // 12 cards), and page 3 of one is not page 3 of the other.
  const { page: _page, page_size: _pageSize, ...kept } = route.query
  void router.replace({ query: { ...kept, [VIEW_TYPE_KEY]: view } })
}

function openRecord(id: string): void {
  // route.query carried along, so Back from the form lands on the same page,
  // sort and filters.
  void router.push({ name: 'settings-user-edit', params: { id }, query: route.query })
}
</script>

<template>
  <section class="page page--wide">
    <header class="page__header">
      <div>
        <h1>Utilisateurs</h1>
        <p class="page__subtitle">
          <template v-if="total !== null">{{ total }} compte{{ total > 1 ? 's' : '' }}</template>
        </p>
      </div>

      <!-- `.page__header > :last-child:not(:only-child)` pushes it right, on
           the title's line. -->
      <div class="users__actions">
        <ViewSwitcher :model-value="viewType" :views="VIEWS" @update:model-value="setViewType" />

        <RouterLink v-if="canCreate" :to="{ name: 'settings-user-create', query: route.query }">
          <Button label="New" icon="pi pi-plus" />
        </RouterLink>
      </div>
    </header>

    <!-- One at a time, with `v-if`: only the mounted view writes the query string. -->
    <UserListView v-if="viewType === 'list'" sync-url @open="openRecord" @loaded="total = $event" />
    <UserCardView v-else sync-url @open="openRecord" @loaded="total = $event" />
  </section>
</template>

<style scoped>
.users__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>

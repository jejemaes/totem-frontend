<script setup lang="ts">
/*
 * `Budgets / Budget X / Chart` above a page's header: the way the user came,
 * each step a link, the current page last and plain.
 *
 * The trail is the one the origin page stamped on this history entry
 * (components/breadcrumbs.ts says why it lives there). Without one -- a typed
 * URL, a shared link, the menu -- the page's own `fallback` is drawn, so the
 * way out never disappears.
 *
 * Router-aware, like form/RecordPager.vue: it belongs to PAGES, never to a
 * view, which would then stop working in a Dialog.
 */
import Breadcrumb from 'primevue/breadcrumb'
import type { MenuItem } from 'primevue/menuitem'
import { computed, onScopeDispose, watchEffect } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'

import {
  crumbState,
  publishCrumbs,
  readCrumbs,
  unpublishCrumbs,
  type Crumb,
} from '@/components/breadcrumbs'

const props = withDefaults(
  defineProps<{
    /** The trail drawn when the entry carries none. Empty: draw nothing then. */
    fallback?: Crumb[]
    /** The current page's own step, drawn last and not as a link. */
    current: string
  }>(),
  { fallback: () => [] },
)

const route = useRoute()
const router = useRouter()

/**
 * `history.state` is not reactive: it is read again on every `fullPath`, which
 * changes on each navigation -- the only moment the entry, and so the state,
 * can change.
 */
const crumbs = computed(() => {
  void route.fullPath
  return readCrumbs(window.history.state) ?? props.fallback
})

/**
 * Published for the router: a record opened from this page -- a movement from
 * an account's movements -- extends THIS trail rather than starting over at a
 * route title. The path is kept aside: by the time this component is
 * disposed, `route` already points at the next page.
 */
let publishedPath: string | null = null
watchEffect(() => {
  if (crumbs.value.length === 0) return
  publishedPath = route.path
  publishCrumbs(route.path, [...crumbs.value, { label: props.current, to: route.fullPath }])
})
onScopeDispose(() => {
  if (publishedPath !== null) unpublishCrumbs(publishedPath)
})

/**
 * Where a crumb leads, carrying the trail BEFORE it: from `Budgets / Budget X /
 * Chart`, the budget's form still reads `Budgets / Budget X`. Resolved first,
 * because a `{ path }` location drops the query its string holds.
 */
function target(index: number): RouteLocationRaw {
  const { path, query, hash } = router.resolve(crumbs.value[index].to)
  const before = crumbs.value.slice(0, index)
  return before.length > 0 ? { path, query, hash, state: crumbState(before) } : { path, query, hash }
}

/** `route` is a key of our own: PrimeVue's `url` would bypass the router and its `/tabou/`. */
const items = computed<MenuItem[]>(() => [
  ...crumbs.value.map(({ label }, index) => ({ label, route: target(index) })),
  { label: props.current },
])
</script>

<template>
  <Breadcrumb v-if="crumbs.length > 0" :model="items" class="breadcrumbs">
    <template #item="{ item, props: itemProps }">
      <RouterLink v-if="item.route" :to="item.route" v-bind="itemProps.action">
        {{ item.label }}
      </RouterLink>
      <span v-else v-bind="itemProps.action" aria-current="page">{{ item.label }}</span>
    </template>
  </Breadcrumb>
</template>

<style scoped>
/* Above the page's <h1>, not a toolbar: no panel of its own. */
.breadcrumbs {
  margin-bottom: 0.75rem;
  padding: 0;
  background: transparent;
  font-size: 0.9rem;
}

.breadcrumbs :deep(a.p-breadcrumb-item-link) {
  color: var(--app-muted);
}

.breadcrumbs :deep(a.p-breadcrumb-item-link:hover) {
  color: var(--p-primary-color);
}
</style>

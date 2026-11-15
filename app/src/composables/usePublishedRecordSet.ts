/*
 * Publishes the ids a routed multi-record view shows, so that the form opened
 * from it gets its previous / next buttons (see components/recordSet.ts).
 *
 * Shared by ListView and CardView rather than written into each: they stay
 * route-free in their own source -- the route is only read here, and only
 * when the view owns the URL, exactly as useResourceList does under `syncUrl`.
 *
 * ONLY a view that owns the URL publishes. A list in a Dialog, or in selection
 * mode, is not "the page the user came from": its records are not what the
 * address bar describes, and a form route opened while it is mounted must not
 * pick them up.
 */

import { watch } from 'vue'
import { useRoute } from 'vue-router'

import { publishRecordSet } from '@/components/recordSet'

export function usePublishedRecordSet(
  ownsUrl: boolean,
  /** The ids on screen, in their displayed order; null while none are known yet. */
  ids: () => readonly string[] | null,
): void {
  if (!ownsUrl) return
  const route = useRoute()
  watch(
    ids,
    (shown) => {
      // The PATH, not the full URL: the list rewrites its query string on every
      // sort and page, and the router compares against where the navigation
      // left from.
      if (shown) publishRecordSet(route.path, shown)
    },
    { immediate: true },
  )
}

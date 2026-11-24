/*
 * The trail a page was reached by -- `Budgets / Budget X / Chart` -- with no
 * dependency on Vue, so every rule below has a spec.
 *
 * A page reachable from several places (a budget's chart: from the budgets
 * list, or from that budget's form) cannot hard-code its way back: from the
 * form, a "← Budgets" link drops the user on a list they never came from.
 *
 * The trail travels in the DESTINATION's history entry (`history.state`), the
 * way components/recordSet.ts carries a form's previous / next set, and for the
 * same reasons: a typed or pasted URL has none, so it gets the page's own
 * fallback; Back / Forward to the page brings back that entry's own trail; and
 * the query string stays the page's, free of a second writer.
 *
 * Unlike the record set, it is NOT stamped with a boot id: a reload does not
 * make "where you came from" untrue, only -- at worst -- a label stale.
 *
 * The ORIGIN page hands it over, through vue-router's `state` option on its
 * push, rather than the router's `afterEach`: the label of a form (a budget's
 * name) exists only in that page, and pages are already where events become
 * navigation. Each origin declares its WHOLE chain, itself included, rather
 * than extending the one it was reached by -- so a trail cannot grow without
 * end as the user goes back and forth.
 *
 * One exception to "the origin hands it over": a record opened from the
 * routed list it sits in -- the edit button of EVERY list -- is stamped by the
 * router's `afterEach`, beside the record set and under the same condition,
 * so no list page has to remember it. The list's label is the one its own
 * <Breadcrumbs> published (`Accounts / BANK / Movements`), or else its route
 * title (`Budgets`). That publication is a module-level slot, a deliberate
 * singleton like recordSet's: one page is in the address bar at a time.
 */

/** The key under which the trail sits in `history.state`, beside vue-router's own. */
export const BREADCRUMB_STATE_KEY = 'totemBreadcrumbs'

/**
 * One step of the trail. `to` is a `fullPath`, query included, so the link
 * lands on the page, sort and filters the user left.
 *
 * A `type`, not an `interface`: only an alias gets the implicit index
 * signature vue-router's `HistoryState` asks of a `state` it is handed.
 */
export type Crumb = {
  label: string
  to: string
}

let published: { path: string; chain: Crumb[] } | null = null

/**
 * Called by <Breadcrumbs> whenever what it draws changes: its whole chain,
 * the current page included, as a page opened from here should show it.
 */
export function publishCrumbs(path: string, chain: readonly Crumb[]): void {
  published = { path, chain: chain.map(({ label, to }) => ({ label, to })) }
}

/** Called when that <Breadcrumbs> goes away -- only if the slot is still its own. */
export function unpublishCrumbs(path: string): void {
  if (published?.path === path) published = null
}

/**
 * The trail of a page opened from `fromPath`: what that page's <Breadcrumbs>
 * published, or, from a page drawing none, `fallback` alone.
 */
export function takeCrumbs(fromPath: string, fallback: Crumb): Crumb[] {
  if (published?.path !== fromPath) return [{ ...fallback }]
  return published.chain.map(({ label, to }) => ({ label, to }))
}

/** What an origin passes as `state` on its `router.push`. */
export function crumbState(chain: readonly Crumb[]): { [BREADCRUMB_STATE_KEY]: Crumb[] } {
  return { [BREADCRUMB_STATE_KEY]: chain.map(({ label, to }) => ({ label, to })) }
}

/**
 * The trail stamped on a history entry, or null when there is none or it is
 * malformed -- the caller then shows its fallback. `history.state` outlives
 * deployments, so its shape is checked, never trusted. A `to` must be a path
 * of this app: anything else (an absolute URL) is refused rather than linked.
 */
export function readCrumbs(state: unknown): Crumb[] | null {
  if (typeof state !== 'object' || state === null) return null
  const chain = (state as Record<string, unknown>)[BREADCRUMB_STATE_KEY]
  if (!Array.isArray(chain) || chain.length === 0) return null
  const crumbs: Crumb[] = []
  for (const crumb of chain) {
    if (typeof crumb !== 'object' || crumb === null) return null
    const { label, to } = crumb as Record<string, unknown>
    if (typeof label !== 'string' || label === '') return null
    if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//')) return null
    crumbs.push({ label, to })
  }
  return crumbs
}

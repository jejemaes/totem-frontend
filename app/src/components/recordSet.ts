/*
 * The records of the page a form was opened from, for its previous / next
 * buttons -- with no dependency on Vue, so every rule below has a spec.
 *
 * The set travels in the FORM's history entry (`history.state`), not in a
 * store or the query string:
 *
 * - a typed or pasted URL has no state, so it gets no buttons -- which is the
 *   rule: they mean "the page you came from", and there is none;
 * - Back / Forward to a form brings back that entry's own set, not whichever
 *   list was opened last;
 * - the query string is the list's, carried along so Back lands on the same
 *   page; a few hundred ids there would make every link unreadable.
 *
 * `history.state` survives a reload, and the buttons must NOT: the set is a
 * snapshot of a list the user no longer has in front of them. Hence `BOOT_ID`,
 * drawn once per page load and stamped on the set -- after an F5 it no longer
 * matches, and the set reads as absent.
 *
 * How a set gets there: the routed ListView / CardView PUBLISHES the ids it
 * shows (`publishRecordSet`), and the router's `afterEach` TAKES them onto the
 * new entry when the navigation left that list's path for one of those ids.
 * The publication is a module-level slot -- a deliberate singleton, like
 * `useTheme`: there is one routed list at a time, the one in the address bar.
 */

/** The key under which the set sits in `history.state`, beside vue-router's own. */
export const RECORD_SET_STATE_KEY = 'totemRecordSet'

/**
 * Drawn once per page load. Not `crypto.randomUUID()`: it exists only in a
 * secure context, and a plain-http staging host would throw at import.
 */
export const BOOT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** A `type`, not an `interface`: only an alias gets the implicit index
    signature vue-router's `HistoryState` asks of a `state` it is handed. */
export type RecordSetState = {
  boot: string
  ids: string[]
}

let published: { path: string; ids: string[] } | null = null

/** Called by the routed list each time its page lands. */
export function publishRecordSet(path: string, ids: readonly string[]): void {
  published = { path, ids: [...ids] }
}

/**
 * The published ids, if the navigation came FROM the list that published them
 * and goes to one of its records. Any other origin -- the dashboard, a link in
 * another form, the first load -- answers null.
 */
export function takeRecordSet(fromPath: string, id: string): string[] | null {
  if (!published || published.path !== fromPath || !published.ids.includes(id)) return null
  return [...published.ids]
}

export function recordSetState(ids: readonly string[], boot: string = BOOT_ID): RecordSetState {
  return { boot, ids: [...ids] }
}

/**
 * The ids stamped on a history entry, or null when there are none, they are
 * malformed, or they were stamped before the last reload.
 */
export function readRecordSet(state: unknown, boot: string = BOOT_ID): string[] | null {
  if (typeof state !== 'object' || state === null) return null
  const set = (state as Record<string, unknown>)[RECORD_SET_STATE_KEY]
  if (typeof set !== 'object' || set === null) return null
  const { boot: stamped, ids } = set as Record<string, unknown>
  if (stamped !== boot || !Array.isArray(ids) || ids.length === 0) return null
  if (!ids.every((id) => typeof id === 'string')) return null
  return ids as string[]
}

/** Where `id` sits in the set, or null when it is not in it: no buttons then. */
export function recordPosition(
  ids: readonly string[],
  id: string,
): { index: number; total: number } | null {
  const index = ids.indexOf(id)
  return index === -1 ? null : { index, total: ids.length }
}

/**
 * The neighbour of `id`, WRAPPING at both ends: the buttons are never disabled,
 * past the last record comes the first. An id outside the set answers itself.
 */
export function stepRecord(ids: readonly string[], id: string, step: 1 | -1): string {
  const index = ids.indexOf(id)
  if (index === -1) return id
  return ids[(index + step + ids.length) % ids.length]
}

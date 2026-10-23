/*
 * Which columns a <ListView> shows, in which order, and what it must therefore
 * ask the backend for -- with no dependency on Vue.
 *
 * Three inputs meet here and can disagree: the <Field>s the view declares, the
 * preferences a user saved in localStorage some releases ago, and the
 * `?fields=` the request must carry. A stored name the view no longer declares,
 * a field added since, a corrupted entry, a user unticking the last column --
 * each of those quietly breaks a table, and none shows up until a user with
 * old preferences opens it. Hence a Vue-free module with a spec, like
 * fields/values.ts.
 */

/** What the merge needs to know about a declared column. */
export interface ColumnDeclaration {
  name: string
  /** Shown when the user has no preference about it. */
  defaultDisplay: boolean
  /** The row keys its cell reads -- what `?fields=` must carry when shown. */
  fields: readonly string[]
}

/** One column as the table shows it: in this order, visible or not. */
export interface ColumnState {
  name: string
  visible: boolean
}

/**
 * What localStorage holds. Names, never positions: a position means nothing
 * once the view adds a column, a name still does.
 */
export interface ColumnPrefs {
  order: string[]
  hidden: string[]
}

/** Namespaced, so a list's key cannot collide with the theme or the token. */
export const COLUMN_PREFS_PREFIX = 'totem.list.'

export function columnPrefsKey(storageKey: string): string {
  return `${COLUMN_PREFS_PREFIX}${storageKey}`
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/**
 * The stored string -> preferences, or null.
 *
 * Null for anything unexpected rather than a throw: the value was written by an
 * older release, or by hand in the devtools, and a broken preference must cost
 * the user their column choice, never the table.
 */
export function parseColumnPrefs(raw: string | null): ColumnPrefs | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { order, hidden } = parsed as Record<string, unknown>
  if (!isStringArray(order) || !isStringArray(hidden)) return null
  return { order, hidden }
}

export function serialiseColumnPrefs(state: readonly ColumnState[]): string {
  const prefs: ColumnPrefs = {
    order: state.map((column) => column.name),
    hidden: state.filter((column) => !column.visible).map((column) => column.name),
  }
  return JSON.stringify(prefs)
}

/**
 * The declarations, ordered and filtered by the preferences.
 *
 * - a stored name the view no longer declares is DROPPED;
 * - a declared name the preferences never saw (a column added since) goes at
 *   the END with its own `defaultDisplay` -- not hidden, which is how a new
 *   column would stay invisible forever to everyone who ever ticked a box;
 * - at least one column is visible: a table with no column has no row to
 *   click and no cog left to bring one back.
 */
export function resolveColumns(
  declarations: readonly ColumnDeclaration[],
  prefs: ColumnPrefs | null,
): ColumnState[] {
  const byName = new Map(declarations.map((declaration) => [declaration.name, declaration]))
  const known = new Set(prefs?.order ?? [])
  const hidden = new Set(prefs?.hidden ?? [])

  const ordered = [
    ...(prefs?.order ?? []).filter((name) => byName.has(name)),
    ...declarations.map((declaration) => declaration.name).filter((name) => !known.has(name)),
  ]

  const state = [...new Set(ordered)].map((name) => ({
    name,
    visible: known.has(name) ? !hidden.has(name) : byName.get(name)!.defaultDisplay,
  }))

  if (state.length && !state.some((column) => column.visible)) state[0].visible = true
  return state
}

/** Flips one column -- except the last visible one, which stays. */
export function toggleColumn(state: readonly ColumnState[], name: string): ColumnState[] {
  const target = state.find((column) => column.name === name)
  if (!target) return [...state]
  const visibleCount = state.filter((column) => column.visible).length
  if (target.visible && visibleCount <= 1) return [...state]
  return state.map((column) =>
    column.name === name ? { ...column, visible: !column.visible } : column,
  )
}

/**
 * Moves the column at `from` to `to`, as a drop in the column menu means it.
 * Out-of-range indexes leave the order alone rather than inventing a slot.
 */
export function moveColumn(
  state: readonly ColumnState[],
  from: number,
  to: number,
): ColumnState[] {
  const inRange = (index: number): boolean => Number.isInteger(index) && index >= 0 && index < state.length
  if (!inRange(from) || !inRange(to) || from === to) return [...state]
  const next = [...state]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * The `?fields=` of the request: `id` first -- the DataTable's key, and what
 * every action and the selection hand back -- then what the visible cells
 * read, then whatever the caller needs on top (`sequence` for a reorderable
 * list). Deduplicated, in a stable order.
 *
 * A hidden column is NOT asked for: that is the whole point of letting the
 * user pick, a wide relation costs the backend a join per row.
 */
export function requestedFields(
  declarations: readonly ColumnDeclaration[],
  state: readonly ColumnState[],
  extra: readonly string[] = [],
): string[] {
  const byName = new Map(declarations.map((declaration) => [declaration.name, declaration]))
  const fields = ['id']
  for (const column of state) {
    if (!column.visible) continue
    fields.push(...(byName.get(column.name)?.fields ?? []))
  }
  fields.push(...extra)
  return [...new Set(fields)]
}

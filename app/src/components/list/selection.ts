/*
 * The rows a <ListView> in selection mode has checked, across pages -- with no
 * dependency on Vue.
 *
 * A lazy DataTable only ever holds ONE page: its `selection` is whatever is
 * checked among the rows it was handed, so going to page 2 and back silently
 * forgets page 1. The real selection therefore lives here, keyed by id, and
 * the table is shown only its page's share of it.
 *
 * An entry may hold `null` instead of a row: an id the caller handed in
 * (`v-model:selection`, the value a many2many field already holds) whose row
 * no page has shown yet. It stays selected; it just cannot be described until
 * its page is visited.
 */

/** Ids are compared as strings: a number id and its string form are one row. */
export function rowKey(row: { id: string | number }): string {
  return String(row.id)
}

export type Selection<R> = ReadonlyMap<string, R | null>

/**
 * The selection re-aligned on a list of ids -- what the caller's v-model says.
 * Known rows are kept, unknown ids enter as `null`, the rest leave.
 */
export function selectionFromIds<R>(
  previous: Selection<R>,
  ids: readonly (string | number)[],
): Map<string, R | null> {
  const next = new Map<string, R | null>()
  for (const id of ids) {
    const key = String(id)
    next.set(key, previous.get(key) ?? null)
  }
  return next
}

/** The rows of the CURRENT page that are selected -- what the DataTable shows. */
export function pageSelection<R extends { id: string | number }>(
  selection: Selection<R>,
  pageRows: readonly R[],
): R[] {
  return pageRows.filter((row) => selection.has(rowKey(row)))
}

/**
 * The DataTable's new page selection, merged into the whole one.
 *
 * Every row of the page is first dropped, then the checked ones are put back:
 * that is how an unchecked row leaves, and why rows of OTHER pages, absent from
 * both lists, are untouched. Insertion order is kept for the rows that stay,
 * so the ids handed back do not reshuffle on every click.
 */
export function applyPageSelection<R extends { id: string | number }>(
  selection: Selection<R>,
  pageRows: readonly R[],
  checked: readonly R[],
): Map<string, R | null> {
  const onPage = new Set(pageRows.map(rowKey))
  const kept = new Set(checked.map(rowKey))
  const next = new Map<string, R | null>()

  for (const [key, row] of selection) {
    if (onPage.has(key) && !kept.has(key)) continue
    next.set(key, row)
  }
  // A row seen now replaces a `null` placeholder: it is what labels it.
  for (const row of checked) next.set(rowKey(row), row)
  return next
}

export function selectedIds<R>(selection: Selection<R>): string[] {
  return [...selection.keys()]
}

/** The rows known so far, placeholders left out. */
export function selectedRows<R>(selection: Selection<R>): R[] {
  return [...selection.values()].filter((row): row is R => row !== null)
}

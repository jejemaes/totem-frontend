/*
 * The logic behind ManyToManyTagsField, with no dependency on Vue.
 *
 * Same reason as many2one.ts: this is the part that quietly mislabels a chip or
 * drops a selected id, so it must be testable in a `node` environment, without
 * mounting a component.
 *
 * Everything about labelling, colours, dedup, sorting and the local search text
 * is INHERITED from many2one.ts rather than rewritten: a tag must read the same
 * whether it is picked one at a time or several. What lives here is only what
 * becomes a different problem once the value is a list.
 */

import {
  displayRelation,
  toRelationOptions,
  type RelationDisplay,
  type RelationOption,
  type RelationRecord,
} from './many2one'

/*
 * Re-exported so a consumer of the many-to-many field has one module to import
 * from. They are the same types on purpose -- a resource module writes ONE
 * loader and both widgets take it.
 */
export type { RelationDisplay, RelationFetch, RelationOption, RelationRecord } from './many2one'

/** An id usable as a value of the list -- and as a payload entry. */
function usableId(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '') return value
  return null
}

/**
 * Narrows an arbitrary value to a list of ids.
 *
 * Total over `unknown` because the value may arrive straight from backend JSON,
 * or from a `data` dict the caller built by hand: anything that is not a usable
 * id is dropped rather than trusted. A bare id is read as a one-element list,
 * which is what a caller holding a single id means.
 *
 * Deduplicates, and compares on the STRING form to do it: the same tag arriving
 * once as 3 and once as '3' is one tag, and two chips for it would let the user
 * "remove" it and watch it stay.
 */
export function toRelationIds(value: unknown): (string | number)[] {
  const single = usableId(value)
  if (single !== null) return [single]
  if (!Array.isArray(value)) return []

  const ids: (string | number)[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const id = usableId(entry)
    if (id === null || seen.has(String(id))) continue
    seen.add(String(id))
    ids.push(id)
  }
  return ids
}

/**
 * What <MultiSelect> emits -> a FieldValue.
 *
 * Holds the invariant of every list-valued widget: the empty state is `[]`,
 * never `null` and never undefined, and the array is always a FRESH one -- the
 * value handed to the form must not be an object the control still holds a
 * reference to.
 */
export function toRelationValues(next: unknown): (string | number)[] {
  return toRelationIds(next)
}

/**
 * The records describing the given ids, among those the resource nested.
 *
 * The comparison is on the STRING form: the ids come from the form draft, where
 * a numeric id may well have travelled as a string. Records matching no id are
 * dropped -- a stale `options.records` (the parent reloaded another contact)
 * must never label ids it does not describe.
 */
export function relationRecordsFor(
  ids: readonly (string | number)[],
  records: readonly RelationRecord[] | null | undefined,
): RelationRecord[] {
  if (!Array.isArray(records) || !ids.length) return []
  const wanted = new Set(ids.map(String))
  return records.filter((record) => record && wanted.has(String(record.id)))
}

/**
 * Makes sure every selected record is one of the entries.
 *
 * Load-bearing, and more so than in the many-to-one case: nothing is fetched
 * until the dropdown is opened, so BEFORE the first open these records are the
 * only entries there are -- without this the field would paint no chips at all
 * for a contact that has tags. After a backend search that excludes them, it is
 * what stops the chips from vanishing mid-edit.
 */
export function withSelectedRecords(
  options: readonly RelationOption[],
  records: readonly RelationRecord[] | null | undefined,
  display: RelationDisplay = displayRelation,
): RelationOption[] {
  if (!Array.isArray(records) || !records.length) return [...options]

  // The fetched entries win: `records` is what the resource nested when the
  // page loaded, and a row fetched since is the fresher description of the
  // same tag.
  const known = new Set(options.map((option) => String(option.value)))
  const missing = records.filter((record) => record && !known.has(String(record.id)))
  if (!missing.length) return [...options]

  // Through toRelationOptions rather than a hand-rolled mapping: it is what
  // drops a record with no id, builds the label, reads the colour and joins the
  // search text. The merge is then re-sorted as a WHOLE, so a record forced in
  // does not land at the end of an otherwise alphabetical list.
  return [...options, ...toRelationOptions(missing, display)].sort((left, right) =>
    left.label.localeCompare(right.label),
  )
}

/**
 * The ids -> the entries to paint, in the order the ids are held.
 *
 * The single source for the chips, for the read-only pills and for telling
 * whether an id resolves to anything at all, so those three renderings cannot
 * drift. An id with no entry is skipped here and reported by
 * `unresolvedRelationIds` instead -- never silently dropped.
 */
export function selectedRelationOptions(
  ids: readonly (string | number)[],
  options: readonly RelationOption[],
): RelationOption[] {
  const byValue = new Map(options.map((option) => [String(option.value), option]))
  const selected: RelationOption[] = []
  for (const id of ids) {
    const option = byValue.get(String(id))
    if (option) selected.push(option)
  }
  return selected
}

/**
 * Ids nothing can label: a tag deleted since the record was written, or one the
 * resource did not nest and no fetch has reached yet.
 *
 * Surfaced by the field rather than dropped, for the same reason
 * `unmanagedRoleIds` exists: an id the user never saw must not disappear from
 * the payload just because the form could not name it.
 */
export function unresolvedRelationIds(
  ids: readonly (string | number)[],
  options: readonly RelationOption[],
): (string | number)[] {
  const known = new Set(options.map((option) => String(option.value)))
  return ids.filter((id) => !known.has(String(id)))
}

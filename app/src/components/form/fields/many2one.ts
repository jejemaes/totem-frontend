/*
 * The logic behind ManyToOneField, with no dependency on Vue.
 *
 * Same reason as values.ts: this is the part that quietly mislabels a row or
 * loses the selected one, so it must be testable in a `node` environment,
 * without mounting a component.
 */

import type { FieldValue } from './types'

/**
 * A related record, as a list endpoint returns it.
 *
 * Only `id` is required -- it is what ends up in the payload. `name` and
 * `color` are the two keys the generic display understands; everything else is
 * carried, and reachable by a custom display function.
 */
export interface RelationRecord {
  id: string | number
  name?: unknown
  color?: unknown
  [key: string]: unknown
}

/** Builds the string shown for a record, in the dropdown and in read-only. */
export type RelationDisplay = (record: RelationRecord) => string

/**
 * Loads the candidates, optionally narrowed by what the user typed.
 *
 * The search is the ENDPOINT's business: the function comes from a resource
 * module, which knows the filter parameter name and the `?fields=` list. The
 * widget only ever hands it a term and an abort signal.
 */
export type RelationFetch = (
  search: string | null,
  signal?: AbortSignal,
) => Promise<RelationRecord[]>

/** One entry of the dropdown. */
export interface RelationOption {
  value: string | number
  label: string
  /** Palette index, or null when the record carries no usable colour. */
  color: number | null
  /**
   * Every scalar of the record, joined. <Select filter> ALSO filters locally,
   * on the fields named by `filterFields`; matching this one is what stops the
   * local pass from hiding a row the backend just matched on a key the label
   * does not contain -- an ISO code, a reference, an email.
   */
  search: string
}

/**
 * The generic label: the `name` of the record, else its id.
 *
 * A numeric `name` is accepted (it is still a label); anything else -- an
 * object, a null, an empty string -- falls back to the id, which is always
 * there. Never returns '': a blank entry in a dropdown is unpickable.
 */
export function displayRelation(record: RelationRecord): string {
  const name = record.name
  if (typeof name === 'string' && name.trim() !== '') return name.trim()
  if (typeof name === 'number' && Number.isFinite(name)) return String(name)
  return String(record.id)
}

/**
 * The palette index of a record, or null.
 *
 * Deliberately strict: the index is fed to colorAt(), which falls back to
 * index 0 for anything out of range, so a `color` that is not a real integer
 * must read as "no colour" rather than as slate.
 */
export function relationColor(record: RelationRecord): number | null {
  const color = record.color
  return typeof color === 'number' && Number.isInteger(color) ? color : null
}

/** An id usable as a select value -- and as a payload value. */
function usableId(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '') return value
  return null
}

/** Every scalar of the record, for the local filter pass. */
function searchText(record: RelationRecord, label: string): string {
  const parts = [label]
  for (const [key, value] of Object.entries(record)) {
    // The colour is an index, not text: '12' would match a search for "12".
    if (key === 'color') continue
    if (typeof value === 'string' || typeof value === 'number') parts.push(String(value))
  }
  return parts.join(' ')
}

/** Sorted by what the user reads, not by what the backend returned. */
function sortOptions(options: RelationOption[]): RelationOption[] {
  return [...options].sort((left, right) => left.label.localeCompare(right.label))
}

function toRelationOption(record: RelationRecord, display: RelationDisplay): RelationOption | null {
  const value = usableId(record.id)
  // A record with no id cannot be selected: it would put `undefined` in the
  // payload. It comes from a `?fields=` list that forgot `id`, so dropping it
  // is the honest reading -- and the dropdown is then visibly empty.
  if (value === null) return null

  const label = display(record)
  return { value, label, color: relationColor(record), search: searchText(record, label) }
}

/**
 * Records -> dropdown entries: labelled, deduplicated by id, sorted by label.
 *
 * The dedup is not paranoia: `fetchAllPages` walks several pages, and a row
 * inserted between two of them shifts the others, which can return one twice.
 */
export function toRelationOptions(
  records: readonly RelationRecord[] | undefined,
  display: RelationDisplay = displayRelation,
): RelationOption[] {
  if (!Array.isArray(records)) return []

  const byValue = new Map<string, RelationOption>()
  for (const record of records) {
    const option = toRelationOption(record, display)
    if (option && !byValue.has(String(option.value))) byValue.set(String(option.value), option)
  }
  return sortOptions([...byValue.values()])
}

/**
 * Makes sure the selected record is one of the entries.
 *
 * Load-bearing, not cosmetic: <Select> shows its placeholder when no option
 * matches the model value, so right after a server-side search that excludes
 * the selected row, the field would read as EMPTY while still holding a value.
 */
export function withSelectedRecord(
  options: readonly RelationOption[],
  record: RelationRecord | null | undefined,
  display: RelationDisplay = displayRelation,
): RelationOption[] {
  if (!record) return [...options]

  const selected = toRelationOption(record, display)
  if (!selected) return [...options]
  if (options.some((option) => String(option.value) === String(selected.value))) return [...options]

  return sortOptions([...options, selected])
}

/**
 * The record behind the current value, or null.
 *
 * The comparison is on the STRING form: the value comes from the form draft,
 * where a numeric id may well have travelled as a string. Returning null when
 * the record does not match the value is the point -- a stale `options.record`
 * must never label a value it does not describe.
 */
export function relationRecordFor(
  value: FieldValue,
  record: RelationRecord | null | undefined,
): RelationRecord | null {
  if (value === null || value === undefined || value === '') return null
  if (!record) return null
  return String(record.id) === String(value) ? record : null
}

/**
 * What <Select> emits -> a FieldValue.
 *
 * Holds the invariant of every widget in this folder: an empty field is `null`,
 * never '' and never undefined. Clearing the dropdown emits `null` already, but
 * the clear button of some PrimeVue versions emits '' instead.
 */
export function toRelationValue(next: unknown): FieldValue {
  return usableId(next)
}

/*
 * Value helpers, with no dependency on Vue.
 *
 * Every slightly treacherous bit of field logic is concentrated here precisely
 * so it can be tested in a `node` environment, without mounting a component.
 */

import type { ChoiceInput, FieldValue, SelectionChoice } from './types'

/**
 * A field is empty when it is `null`, `undefined`, the empty string or the
 * empty list.
 *
 * What is deliberately NOT empty: `false` (a boolean answered "no") and `0` (a
 * perfectly valid number). Conflating the two is the classic `required` bug.
 *
 * A list-valued field is empty at `[]` and not at `null`: that is the shape it
 * actually holds when the user has picked nothing, so a `required` many-to-many
 * would otherwise always pass.
 */
export function isEmpty(value: FieldValue | undefined): boolean {
  if (Array.isArray(value)) return value.length === 0
  return value === undefined || value === null || value === ''
}

/**
 * Do two field values hold the same thing?
 *
 * `Object.is` for every scalar -- which is all it ever needed to be while a
 * FieldValue was a primitive. Two lists compare as SETS instead: a
 * many-to-many has no order, the backend accepts the ids in any, and the widget
 * rebuilds the array on every pick. Comparing those by reference would report
 * the field as edited on every render, which turns Save into a permanent
 * no-op-that-PATCHes; comparing them by ORDER would report a reordering that
 * the user cannot even perform.
 *
 * A list and a scalar are never equal -- `Object.is` already says so.
 */
export function sameFieldValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    // Compared in their string form, and sorted as strings: the ids may be
    // numbers on one side and the strings the backend sent on the other, and
    // this is a set comparison, not an ordering anyone reads.
    const left = a.map(String).sort()
    const right = b.map(String).sort()
    return left.every((id, index) => id === right[index])
  }
  return Object.is(a, b)
}

/**
 * Narrows an arbitrary value to a number, or to `null`.
 *
 * The `data` handed to a form is not necessarily well typed (it may come
 * straight from backend JSON), so the numeric fields feed through this rather
 * than trusting their `modelValue`.
 */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  // `true` would become 1 via Number(): a boolean has no business in a numeric
  // field, so empty beats silently wrong.
  return null
}

/**
 * Normalises a SelectionField's choice list.
 *
 * Accepts the full `{ value, label }` form and the `['a', 'b']` shorthand, so
 * trivial lists stay readable in the template.
 */
export function normaliseChoices(input: ChoiceInput[] | undefined): SelectionChoice[] {
  if (!Array.isArray(input)) return []
  return input.map((choice) =>
    typeof choice === 'string' || typeof choice === 'number'
      ? { value: choice, label: String(choice) }
      : choice,
  )
}

/** Matches an ISO calendar date, and nothing else: no time, no timezone. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `YYYY-MM-DD` -> a `Date` at LOCAL midnight, or `null`.
 *
 * Built from the three components rather than `new Date('2024-03-31')`: the
 * string form is parsed as UTC by the spec, so east of Greenwich the resulting
 * Date already reads as the previous day at local time -- and that is the value
 * a date picker would then display.
 *
 * The re-read at the end rejects a date that does not exist (`2023-02-30`,
 * which the Date constructor happily rolls over to March 2nd).
 */
export function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null

  const match = ISO_DATE.exec(value.trim())
  if (!match) return null

  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/**
 * A `Date` -> `YYYY-MM-DD`, or `null`.
 *
 * Read from the LOCAL components, never through `toISOString()`: that converts
 * to UTC, so a date picked at local midnight in Europe/Paris would be written
 * back as the day before. A birth date has no timezone -- it is a calendar day.
 */
export function toIsoDate(value: unknown): string | null {
  const date = toDateOrNull(value)
  if (!date) return null

  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

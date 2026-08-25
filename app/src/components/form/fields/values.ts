/*
 * Value helpers, with no dependency on Vue.
 *
 * Every slightly treacherous bit of field logic is concentrated here precisely
 * so it can be tested in a `node` environment, without mounting a component.
 */

import type { ChoiceInput, FieldValue, SelectionChoice } from './types'

/**
 * A field is empty when it is `null`, `undefined` or the empty string.
 *
 * What is deliberately NOT empty: `false` (a boolean answered "no") and `0` (a
 * perfectly valid number). Conflating the two is the classic `required` bug.
 */
export function isEmpty(value: FieldValue | undefined): boolean {
  return value === undefined || value === null || value === ''
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

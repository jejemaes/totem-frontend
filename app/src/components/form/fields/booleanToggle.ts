/*
 * The decisions behind BooleanToggleField, with no dependency on Vue.
 *
 * A switch is a two-state control: unlike BooleanField's optional dropdown, it
 * has no "Unset" to show, so whatever the `data` carries has to land on one
 * side. Kept apart, like values.ts, because a value read on the wrong side is
 * invisible until it decides which fields a form shows -- a contact opening as
 * a person when it is a company.
 */

import type { FieldOptions, FieldValue } from './types'

/** The labels used when the field declares none. */
export const DEFAULT_TRUE_LABEL = 'Yes'
export const DEFAULT_FALSE_LABEL = 'No'

/**
 * The side the switch sits on.
 *
 * The same narrowing as BooleanField (`"true"`, `1`, `"1"` are on), except that
 * `null` -- and anything unrecognised -- reads as OFF: a switch cannot show a
 * third state, and off is what a new record of a `default=False` column holds.
 */
export function toggleValue(raw: FieldValue | undefined): boolean {
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

/**
 * The text on each side of the switch, from `options.true_label` and
 * `options.false_label`. A missing or blank label falls back on Yes / No rather
 * than leaving one side of the control unnamed.
 */
export function toggleLabels(
  options: Pick<FieldOptions, 'true_label' | 'false_label'> = {},
): { on: string; off: string } {
  const label = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.trim() !== '' ? value : fallback
  return {
    on: label(options.true_label, DEFAULT_TRUE_LABEL),
    off: label(options.false_label, DEFAULT_FALSE_LABEL),
  }
}

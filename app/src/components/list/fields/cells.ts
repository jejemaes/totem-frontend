/*
 * What the cells of a <ListView> display, with no dependency on Vue.
 *
 * A cell is where a `false` turns into a blank, a `0` into a dash, or a
 * calendar day into the day before -- the bugs that only a user scanning a
 * column notices. Every decision is therefore made here, with a spec, and the
 * .vue cells only lay the result out.
 *
 * INVARIANT: `null` and `undefined` read the same -- empty. `undefined` is not
 * an oddity here: list responses carry only the keys asked for in `?fields=`,
 * so a column whose key was not requested has no value at all.
 */

import {
  normaliseChoices,
  toDateOrNull,
  toDateTimeOrNull,
  toNumberOrNull,
} from '@/components/form/fields/values'
import { displayRelation, type RelationRecord } from '@/components/form/fields/many2one'
import type { ChoiceInput, FieldOptions } from '@/components/form/fields/types'

/** What an empty cell shows. One dash, not a blank: a blank reads as "still loading". */
export const EMPTY_CELL = '—'

/**
 * Empty, for display. Strict on purpose -- `false` and `0` are values a user
 * must see, which a truthiness test would hide.
 */
export function isBlankCell(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** A string or a finite number as text; anything else (an object) is empty. */
export function formatText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * A number with the locale's grouping. Decimals arrive from the API as STRINGS
 * (a `Decimal` serialised exactly), hence toNumberOrNull rather than a type
 * test -- `"12.50"` is a value, not text.
 */
export function formatNumber(
  value: unknown,
  options: { maxFractionDigits?: number; integer?: boolean } = {},
  locale?: string,
): string | null {
  const number = toNumberOrNull(value)
  if (number === null) return null
  const digits = options.integer ? 0 : (options.maxFractionDigits ?? 2)
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(number)
}

/**
 * `true` / `false`, or null when the value is unknown. Three states, not two: a
 * nullable boolean column must not show a missing value as "no".
 */
export function toBooleanCell(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** A calendar day, read through toDateOrNull so `2024-03-31` stays the 31st. */
export function formatDate(value: unknown, locale?: string): string | null {
  return toDateOrNull(value)?.toLocaleDateString(locale) ?? null
}

/** An instant, shown in the browser's own timezone. */
export function formatDateTime(value: unknown, locale?: string): string | null {
  return toDateTimeOrNull(value)?.toLocaleString(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }) ?? null
}

/**
 * The label of a selection value. An unknown value is shown RAW rather than
 * blanked: a choice the backend added since this screen was written is still
 * a value, and hiding it would make the row look empty.
 */
export function selectionLabel(value: unknown, choices: ChoiceInput[] | undefined): string | null {
  if (isBlankCell(value)) return null
  const match = normaliseChoices(choices).find((choice) => choice.value === value)
  return match?.label ?? formatText(value)
}

function isRecord(value: unknown): value is RelationRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const id = (value as Record<string, unknown>).id
  return typeof id === 'string' || typeof id === 'number'
}

/**
 * A related record as a list nests it, or null. A bare id -- a backend that
 * did not nest -- is wrapped so that at least the id shows.
 */
export function relationOf(value: unknown): RelationRecord | null {
  if (isRecord(value)) return value
  if (typeof value === 'string' && value.trim() !== '') return { id: value }
  if (typeof value === 'number' && Number.isFinite(value)) return { id: value }
  return null
}

/** The many-to-many counterpart: every usable entry, the rest dropped. */
export function relationsOf(value: unknown): RelationRecord[] {
  if (!Array.isArray(value)) return []
  return value.map(relationOf).filter((record): record is RelationRecord => record !== null)
}

/** The label of a related record, through the column's own display when given. */
export function relationLabel(record: RelationRecord, options?: FieldOptions): string {
  return (options?.relationDisplay ?? displayRelation)(record)
}

/** A palette index, or null: same strictness as relationColor. */
export function colorIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/*
 * What a group turns into on a chart -- its axis label and its numbers -- with
 * no dependency on Vue.
 *
 * Same reason as list/fields/cells.ts, which this reuses: this is where a
 * `null` category becomes a missing bar, a decimal string becomes `NaN`, or
 * `2026-09-01` grouped by month reads as "1 September" -- bugs no type catches
 * and only a reader of the chart notices.
 *
 * INVARIANT: an empty dimension is labelled EMPTY_LABEL, never dropped. The
 * backend returns the group of the records with no category like any other,
 * and its total is part of the picture.
 */

import { toDateOrNull, toNumberOrNull } from '@/components/form/fields/values'
import {
  formatDate,
  formatNumber,
  formatText,
  relationLabel,
  relationOf,
  selectionLabel,
  toBooleanCell,
} from '@/components/list/fields/cells'

import type { ChartFieldDeclaration, ChartFieldOptions, ChartWidget, DatePeriod } from './types'

/** The label of the group whose key is empty: the records with no category. */
export const EMPTY_LABEL = 'None'

/** Between the keys of a group grouped by several dimensions: `Rent / Sep 2026`. */
export const LABEL_SEPARATOR = ' / '

/**
 * The ISO week number and its year. The backend's `Trunc(..., 'week')` lands
 * on the Monday, and the ISO year of a week is the year of its Thursday --
 * which is how 29 December 2025 is week 1 of 2026, not week 53 of 2025.
 */
export function isoWeek(date: Date): { week: number; year: number } {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay() is 0 on Sunday: shifted so Monday is 0, then to the Thursday.
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3)
  const year = thursday.getFullYear()
  const firstThursday = new Date(year, 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  // Rounded: a DST change makes the difference a few hours off a whole week.
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return { week, year }
}

/** A truncated calendar day as the period it stands for, or null. */
export function formatPeriod(value: unknown, period: DatePeriod, locale?: string): string | null {
  const date = toDateOrNull(value)
  if (!date) return null
  switch (period) {
    case 'day':
      return date.toLocaleDateString(locale)
    case 'week': {
      const { week, year } = isoWeek(date)
      return `W${String(week).padStart(2, '0')} ${year}`
    }
    case 'month':
      return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    case 'quarter':
      return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`
    case 'year':
      return String(date.getFullYear())
  }
}

const PERIOD_LABELS: Record<DatePeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
}

/**
 * What a field is called in the dropdowns: its label, plus the period of a
 * truncated date -- `Date (Month)`. Composed here rather than written by each
 * view, so two date fields offered side by side (`Date (Month)`, `Due date
 * (Month)`) can never read the same, and a view only names the field once.
 */
export function fieldLabel(
  label: string,
  widget: ChartWidget,
  options?: ChartFieldOptions,
): string {
  const period = widget === 'date' ? options?.period : undefined
  return period ? `${label} (${PERIOD_LABELS[period]})` : label
}

/** The text of one dimension value, or null when it is empty. */
function dimensionText(
  value: unknown,
  widget: ChartWidget,
  options: ChartFieldOptions | undefined,
  locale?: string,
): string | null {
  switch (widget) {
    case 'many2one': {
      const record = relationOf(value)
      return record ? relationLabel(record, options) : null
    }
    case 'date':
      return options?.period ? formatPeriod(value, options.period, locale) : formatDate(value, locale)
    case 'selection':
      return selectionLabel(value, options?.choices)
    case 'boolean': {
      const flag = toBooleanCell(value)
      return flag === null ? null : flag ? 'Yes' : 'No'
    }
    case 'integer':
      return formatNumber(value, { integer: true }, locale)
    case 'float':
      return formatNumber(value, { maxFractionDigits: options?.maxFractionDigits }, locale)
    case 'string':
      return formatText(value)
  }
}

/** One dimension value as an axis label. Never empty: see EMPTY_LABEL. */
export function dimensionLabel(
  value: unknown,
  widget: ChartWidget,
  options?: ChartFieldOptions,
  locale?: string,
): string {
  return dimensionText(value, widget, options, locale) ?? EMPTY_LABEL
}

/**
 * A group's label: each dimension's, in the order they were picked. All on one
 * axis -- the chart draws one series per MEASURE, never per dimension value.
 */
export function groupLabel(
  group: Record<string, unknown>,
  dimensions: readonly ChartFieldDeclaration[],
  locale?: string,
): string {
  return dimensions
    .map((dimension) =>
      dimensionLabel(group[dimension.name], dimension.widget, dimension.options, locale),
    )
    .join(LABEL_SEPARATOR)
}

/**
 * A measure as a number, or null. Null and NOT zero: the backend answers null
 * for a sum over nothing (a month with no credit), and a zero would draw a bar
 * claiming the opposite. Decimals arrive as strings, hence no type test.
 */
export function measureValue(value: unknown): number | null {
  return toNumberOrNull(value)
}

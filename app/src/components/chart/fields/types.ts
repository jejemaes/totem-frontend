/*
 * Contracts shared by <ChartView>, its <Field>s and the Vue-free modules
 * beside them.
 *
 * Types only, like list/fields/types.ts: everything here is imported by specs
 * running in node, so nothing may pull in a runtime dependency.
 *
 * A chart field is neither a form widget nor a list cell. It never edits and
 * is never drawn on its own: a DIMENSION becomes part of an axis label, a
 * MEASURE becomes a number on a dataset. Hence a registry of its own, much
 * narrower than either -- a `text` or a `color` has no business on an axis.
 */

import type { FieldOptions } from '@/components/form/fields/types'

/** What a <Field type="..."> is to the chart: a key to group by, or an aggregate. */
export type ChartFieldKind = 'dimension' | 'measure'

/**
 * The widget names a chart `<Field widget="...">` accepts. A dimension reads
 * them as label formats; a measure only ever uses `integer` or `float`, and
 * both mean "a number" -- decimals arrive as strings either way.
 */
export type ChartWidget =
  | 'string'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'selection'
  | 'date'
  | 'many2one'

/** The chart types <ChartView> can draw. */
export type ChartType = 'bar' | 'line' | 'pie'

/** How a `date` dimension was truncated by the backend (`date_month` is `month`). */
export type DatePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year'

/**
 * The form's `FieldOptions`, read-only as the list reads them (`choices`,
 * `relationDisplay`), plus the one key only a chart needs.
 */
export interface ChartFieldOptions extends FieldOptions {
  /**
   * `date` dimension: the truncation it stands for. `2026-09-01` is "Sep 2026"
   * for `date_month` and "Q3 2026" for `date_quarter`; without it, a plain
   * day. Not inferred from the name: `date_month` is a backend convention, and
   * guessing from it is how a `birth_date_month` would end up labelled oddly.
   */
  period?: DatePeriod
}

/** Everything ChartView and the modules below need to know about a <Field>. */
export interface ChartFieldDeclaration {
  /** The dimension or measure name, exactly as the backend declares it. */
  name: string
  kind: ChartFieldKind
  widget: ChartWidget
  label: string
  help?: string
  options?: ChartFieldOptions
  /** May order the groups ("Order by"). The backend accepts any asked name;
      this is the view saying which orders mean something to a reader. */
  sortable: boolean
}

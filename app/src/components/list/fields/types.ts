/*
 * Contracts shared by the cells of a <ListView>.
 *
 * Types only, like form/fields/types.ts, and for the same reason: every cell,
 * context.ts and the Vue-free modules import it, so it must not pull in a
 * runtime dependency.
 *
 * A cell is NOT a form widget. It never edits, holds no v-model, and is handed
 * the whole row rather than one value -- which is why this is a registry of its
 * own instead of a reuse of the form's `Widget`, whose members (`text`,
 * `html`, `media_image`) only mean something with an editor behind them.
 * `FieldOptions` IS reused, read-only: `choices`, `relationDisplay` and
 * `maxFractionDigits` mean the same thing on a column as on a field.
 */

import type { FieldOptions } from '@/components/form/fields/types'

export type { FieldOptions }

/** The widget names accepted by a list `<Field widget="...">`. */
export type ListWidget =
  | 'string'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'selection'
  | 'date'
  | 'datetime'
  | 'color'
  | 'many2one'
  | 'many2many_tags'

/**
 * A row as a list endpoint returns it. Only `id` is required -- it is the
 * DataTable's key and what every action and the selection hand back.
 *
 * The resources' `XxxRow` types are aliases (`type`, not `interface`) and get
 * an implicit index signature, which is what makes them assignable to this.
 */
export type ListRow = {
  id: string | number
  [key: string]: unknown
}

/** What a concrete cell takes. */
export interface CellProps {
  /** The whole row: a cell may read more than its own key (a full name). */
  row: ListRow
  /** `row[name]`, handed in so the common case reads one prop. */
  value: unknown
  name: string
  options?: FieldOptions
}

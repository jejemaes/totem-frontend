/*
 * Contracts shared by the fields of a <CardView>.
 *
 * Types only, like list/fields/types.ts, and for the same reason: every card
 * field, context.ts and the Vue-free modules import it, so it must not pull in
 * a runtime dependency.
 *
 * A card field is neither a form widget nor a list cell. It edits nothing, like
 * a cell, but it lays its value out in a block of prose rather than a table
 * column: no right-aligned numbers, a long text wraps and may be truncated, an
 * image is drawn at the card's width. Hence a registry of its own. The Vue-free
 * formatters of list/fields/cells.ts ARE reused: what a `false` or a calendar
 * day displays as must not differ between a table and a card.
 */

import type { FieldOptions } from '@/components/form/fields/types'
import type { ListRow } from '@/components/list/fields/types'

export type { FieldOptions }

/** A record as a list endpoint returns it: the same shape as a table row. */
export type CardRecord = ListRow

/** The widget names accepted by a card `<Field widget="...">`. */
export type CardWidget =
  | 'string'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'selection'
  | 'date'
  | 'datetime'
  | 'color'
  | 'many2one'
  | 'many2many_tags'
  | 'media_image'

/** What a concrete card field takes. */
export interface CardFieldProps {
  /** The whole record: a field may read more than its own key. */
  record: CardRecord
  /** `record[name]`, handed in so the common case reads one prop. */
  value: unknown
  name: string
  options?: FieldOptions
}

/**
 * One entry of a card's "⋮" menu. Built per record when the menu opens, so
 * `condition` and `command` are handed the card's record.
 */
export interface CardMenuItem<R extends CardRecord = CardRecord> {
  label?: string
  /** A primeicons class, `pi pi-copy`: the icon convention of the whole app. */
  icon?: string
  command?: (record: R) => void
  /** Hides the entry for this record when false -- a permission, a state. */
  condition?: (record: R) => boolean
  separator?: boolean
  disabled?: boolean
}

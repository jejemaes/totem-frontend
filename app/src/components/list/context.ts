/*
 * The contract between <ListView> and the <Field>s declared in its slot.
 *
 * Kept apart from both components, like form/context.ts: ListView.vue provides
 * it, Field.vue consumes it, and neither imports the other.
 *
 * Why the fields DECLARE rather than render: PrimeVue's DataTable only finds a
 * <Column> that is its direct child, or rendered under a vnode carrying a `key`
 * (HelperSet._recursive in @primevue/core/utils). A <Field> rendering its own
 * <Column> would work by accident of that `key`, and could not be reordered or
 * hidden by the user anyway. So a <Field> registers what it is, and ListView
 * renders every <Column> itself, in the order the user picked.
 */

import { inject, type InjectionKey } from 'vue'

import type { ColumnDeclaration } from './columns'
import type { FieldOptions, ListRow, ListWidget } from './fields/types'

/** What the slot of a <Field> is handed, for a one-off cell. */
export interface CellScope {
  row: ListRow
  value: unknown
}

/** A <Field>'s default slot, as its `defineSlots` types it. */
export type CellSlot = (scope: CellScope) => unknown

/** Everything ListView needs to render one column. */
export interface ListColumn extends ColumnDeclaration {
  widget: ListWidget
  label: string
  help?: string
  options?: FieldOptions
  /** Asked for by the <Field>; granted only if the backend accepts the key. */
  sortable: boolean
  /** Percentage of the table width. */
  width?: number
  /** The <Field>'s default slot, when the view draws the cell itself. */
  cell?: CellSlot
}

export interface ListContext {
  /**
   * Declares a column. A GETTER, not a snapshot: a <Field>'s props may be
   * reactive (a label computed from a filter), and ListView must follow them.
   * The order of the calls is the declaration order -- setup runs in template
   * order.
   */
  register(name: string, column: () => ListColumn): void
  /** On unmount (`v-if`): the column leaves the table and the menu. */
  unregister(name: string): void
}

export const LIST_CONTEXT: InjectionKey<ListContext> = Symbol('totem.list')

/** Throws rather than returning null: an inert <Field> is far harder to
    diagnose than an error at mount time. */
export function useListContext(): ListContext {
  const context = inject(LIST_CONTEXT, null)
  if (!context) {
    throw new Error('A list <Field> must be used inside a <ListView>.')
  }
  return context
}

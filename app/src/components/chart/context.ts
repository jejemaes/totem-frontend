/*
 * The contract between <ChartView> and the <Field>s declared in its slot.
 *
 * Kept apart from both components, like list/context.ts: ChartView.vue
 * provides it, Field.vue consumes it, and neither imports the other.
 *
 * A chart <Field> DECLARES and renders nothing: it is not drawn on its own, it
 * is an entry in the dimension or measure dropdown, and becomes part of a label
 * or a dataset only once the user picks it.
 */

import { inject, type InjectionKey } from 'vue'

import type { ChartFieldDeclaration } from './fields/types'

export interface ChartContext {
  /**
   * Declares a field. A GETTER, not a snapshot, as in the list: a label may be
   * reactive. The order of the calls is the declaration order -- the order of
   * the dropdowns.
   */
  register(name: string, field: () => ChartFieldDeclaration): void
  /** On unmount (`v-if`): the field leaves the dropdowns. */
  unregister(name: string): void
}

export const CHART_CONTEXT: InjectionKey<ChartContext> = Symbol('totem.chart')

/** Throws rather than returning null: an inert <Field> is far harder to
    diagnose than an error at mount time. */
export function useChartContext(): ChartContext {
  const context = inject(CHART_CONTEXT, null)
  if (!context) {
    throw new Error('A chart <Field> must be used inside a <ChartView>.')
  }
  return context
}

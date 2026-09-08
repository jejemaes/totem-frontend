/*
 * The logic behind FieldSwitch, with no dependency on Vue.
 *
 * Same reason as fields/values.ts: this is the part that decides WHICH field a
 * form shows, so getting it wrong hides a value the user cannot then reach. It
 * must be testable in a `node` environment, without mounting a component.
 */

import type { FieldValue } from './fields/types'
import { isEmpty } from './fields/values'

/** One position of the switch. */
export interface FieldSwitchChoice {
  /** The name of the field this choice reveals. */
  field: string
  label: string
}

/**
 * Which field is currently the active one.
 *
 * Three steps, in this order:
 *
 *   1. the user's explicit pick, when it names one of the choices;
 *   2. else the FIRST choice whose value is filled -- the deduction, which is
 *      what makes this work with a backend that stores no discriminator: the
 *      target of a record IS whichever of its exclusive fields is set;
 *   3. else the first choice, so the switch is never in no position at all.
 *
 * `null` as `selected` therefore means "deduce it", which is exactly the state
 * of a form that has just been seeded from a record. `null` comes back only
 * when there is no choice to return.
 *
 * Emptiness is isEmpty's definition, not a truthiness test: `0` and `false` are
 * filled values, and a field holding either must keep its position.
 */
export function activeSwitchField(
  choices: readonly FieldSwitchChoice[],
  values: Readonly<Record<string, FieldValue>> | undefined,
  selected?: string | null,
): string | null {
  if (!choices.length) return null

  if (selected && choices.some((choice) => choice.field === selected)) return selected

  const filled = choices.find((choice) => !isEmpty(values?.[choice.field]))
  return (filled ?? choices[0]).field
}

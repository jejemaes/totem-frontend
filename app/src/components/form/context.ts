/*
 * The contract between <Form> and the <Field>s declared in its slot.
 *
 * Deliberately kept apart from both components: Form.vue provides the context,
 * fields/Field.vue consumes it, and neither has to import the other -- so no
 * circular dependency.
 */

import { inject, type ComputedRef, type InjectionKey } from 'vue'

import type { FieldValue } from './fields/types'

/** A form's values, keyed by field name. Flat: "a.b" is not a path. */
export type FormData = Record<string, FieldValue>

export interface FormContext {
  /**
   * The draft, read-only. This is what gives every field access to ALL the
   * other values, not just its own.
   *
   * The only way in is `set()`, so a field cannot quietly rewrite a key that
   * does not belong to it.
   */
  values: Readonly<FormData>
  set(name: string, value: FieldValue): void
  /**
   * Declares a key with the form.
   *
   * Fills it with `defaultValue` only when `data` did not carry it at all: an
   * explicit `null` is a real value ("known empty", what the backend sends) and
   * is not overwritten.
   */
  register(name: string, defaultValue: FieldValue): void
  /** Called from a watchEffect: `required` may itself be reactive. */
  setRequired(name: string, required: boolean): void
  /** On unmount (`v-if`): drops the constraint, keeps the value. */
  unregister(name: string): void
  /** True when the field carries an error, whatever its origin. */
  invalid(name: string): boolean
  /**
   * The field's error message: the `required` constraint, or whatever the
   * server answered. `undefined` when the field is valid.
   */
  error(name: string): string | undefined
  /** The form-level readonly. OR-ed by <Field>. */
  readonly: ComputedRef<boolean>
}

export const FORM_CONTEXT: InjectionKey<FormContext> = Symbol('totem.form')

/**
 * Throws rather than returning `null`: a <Field> outside a <Form> has nothing
 * to bind to, and a silently inert field is far harder to diagnose than an
 * error at mount time.
 */
export function useFormContext(): FormContext {
  const context = inject(FORM_CONTEXT, null)
  if (!context) {
    throw new Error('<Field> must be used inside a <Form>.')
  }
  return context
}

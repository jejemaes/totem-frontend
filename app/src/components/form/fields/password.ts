/*
 * The decisions behind PasswordField, with no dependency on Vue.
 *
 * Kept apart for the same reason as values.ts: a pattern that silently passes
 * everything, or a confirmation that compares the wrong keys, stays invisible
 * until someone is locked out of their account -- so it is tested here, in a
 * `node` environment, without mounting the widget.
 *
 * The pattern is a HINT, not the authority: the backend runs Django's password
 * validators on every write, and its refusal lands under the field like any
 * other 422. Checking first only spares a round trip for what a regex can say.
 */

import type { FieldOptions, FieldValue } from './types'

/** Shown when a field declares a `pattern` but no `patternMessage`. */
export const DEFAULT_PATTERN_MESSAGE = 'The password does not have the expected format.'

/** Shown under the confirmation when it differs from the new password. */
export const CONFIRM_MISMATCH_MESSAGE = 'The two passwords do not match.'

/**
 * The message for a value that does not match `options.pattern`, or
 * `undefined` when it does -- or when there is nothing to check.
 *
 * An EMPTY value is not a mismatch: whether it may be empty is `required`'s
 * business, and reporting both would show two errors for one omission.
 *
 * A pattern that does not compile is IGNORED rather than thrown: it is a
 * developer's mistake, and a widget that throws on every keystroke would make
 * the whole form unusable over it. The backend still validates.
 */
export function patternError(
  value: FieldValue | undefined,
  options: Pick<FieldOptions, 'pattern' | 'patternMessage'> = {},
): string | undefined {
  if (typeof value !== 'string' || value === '' || !options.pattern) return undefined
  let regex: RegExp
  try {
    regex = new RegExp(options.pattern, 'u')
  } catch {
    return undefined
  }
  return regex.test(value) ? undefined : (options.patternMessage ?? DEFAULT_PATTERN_MESSAGE)
}

/**
 * The client-side refusals of a "new password + confirmation" form, keyed by
 * field name the way <Form>'s `errors` are: `new_password` against the
 * pattern, `confirm_password` against `new_password`. Empty when it may be
 * sent.
 *
 * Shared by both password dialogs -- one's own and an administrator's -- so the
 * two cannot drift into accepting different things.
 *
 * The confirmation exists because the field is masked: a typo there is
 * invisible, and a password set with one locks its owner out.
 */
export function newPasswordErrors(
  values: Readonly<Record<string, FieldValue>>,
  options: Pick<FieldOptions, 'pattern' | 'patternMessage'> = {},
): Record<string, string> {
  const errors: Record<string, string> = {}
  const mismatch = patternError(values.new_password, options)
  if (mismatch) errors.new_password = mismatch
  if ((values.confirm_password ?? null) !== (values.new_password ?? null)) {
    errors.confirm_password = CONFIRM_MISMATCH_MESSAGE
  }
  return errors
}

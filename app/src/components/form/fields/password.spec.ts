import { describe, expect, it } from 'vitest'

import {
  CONFIRM_MISMATCH_MESSAGE,
  DEFAULT_PATTERN_MESSAGE,
  newPasswordErrors,
  patternError,
} from './password'

/* Eight characters or more, not all digits -- the shape the user screens use. */
const PATTERN = { pattern: '^(?!\\d+$).{8,}$', patternMessage: 'Too weak.' }

describe('patternError', () => {
  it('accepts a matching value', () => {
    expect(patternError('correct horse', PATTERN)).toBeUndefined()
  })

  it('reports a mismatch with the declared message', () => {
    expect(patternError('short', PATTERN)).toBe('Too weak.')
    expect(patternError('12345678', PATTERN)).toBe('Too weak.')
  })

  it('falls back on a default message', () => {
    expect(patternError('short', { pattern: PATTERN.pattern })).toBe(DEFAULT_PATTERN_MESSAGE)
  })

  it('leaves an empty value to `required`', () => {
    expect(patternError(null, PATTERN)).toBeUndefined()
    expect(patternError('', PATTERN)).toBeUndefined()
    expect(patternError(undefined, PATTERN)).toBeUndefined()
  })

  it('checks nothing without a pattern -- the capability is off by default', () => {
    expect(patternError('x')).toBeUndefined()
    expect(patternError('x', {})).toBeUndefined()
  })

  it('ignores a pattern that does not compile instead of throwing', () => {
    expect(patternError('anything', { pattern: '(' })).toBeUndefined()
  })
})

describe('newPasswordErrors', () => {
  it('is empty for a valid, confirmed password', () => {
    const values = { new_password: 'correct horse', confirm_password: 'correct horse' }
    expect(newPasswordErrors(values, PATTERN)).toEqual({})
  })

  it('reports a confirmation that differs', () => {
    const values = { new_password: 'correct horse', confirm_password: 'correct hose' }
    expect(newPasswordErrors(values, PATTERN)).toEqual({
      confirm_password: CONFIRM_MISMATCH_MESSAGE,
    })
  })

  it('reports a missing confirmation as a mismatch', () => {
    const values = { new_password: 'correct horse', confirm_password: null }
    expect(newPasswordErrors(values, PATTERN)).toEqual({
      confirm_password: CONFIRM_MISMATCH_MESSAGE,
    })
  })

  it('reports the pattern and the confirmation together', () => {
    const values = { new_password: 'short', confirm_password: 'other' }
    expect(newPasswordErrors(values, PATTERN)).toEqual({
      new_password: 'Too weak.',
      confirm_password: CONFIRM_MISMATCH_MESSAGE,
    })
  })

  it('ignores the other keys of the form', () => {
    const values = {
      old_password: 'x',
      new_password: 'correct horse',
      confirm_password: 'correct horse',
    }
    expect(newPasswordErrors(values, PATTERN)).toEqual({})
  })
})

import { describe, expect, it } from 'vitest'

import { NON_FIELD, parseApiError } from './client'

/*
 * The bodies below are the real shapes, from three different backend code
 * paths: totem/api.py's exception handlers, django-ninja's pydantic handler,
 * and core/api/controller.py's service-error translation. Pinning them is the
 * whole point of this file -- the object-array shape used to be dropped
 * silently, turning every validation failure into "Error 422".
 */

describe('parseApiError', () => {
  it('reads a bare string detail (404)', () => {
    expect(parseApiError({ detail: 'Object not found' }, 404)).toEqual({
      message: 'Object not found',
    })
  })

  it('joins a string-array detail (403)', () => {
    const body = { detail: ['You do not have permission to perform this action.'] }
    expect(parseApiError(body, 403)).toEqual({
      message: 'You do not have permission to perform this action.',
    })
  })

  it('joins a multi-message Django ValidationError (400)', () => {
    expect(parseApiError({ detail: ['msg a', 'msg b'] }, 400)).toEqual({
      message: 'msg a msg b',
    })
  })

  // The string shapes must stay distinguishable from an empty 422, so `fields`
  // is absent rather than {}.
  it('leaves fields undefined for the string shapes', () => {
    expect(parseApiError({ detail: 'nope' }, 404).fields).toBeUndefined()
    expect(parseApiError({ detail: ['nope'] }, 403).fields).toBeUndefined()
  })

  it('keys a pydantic 422 on the public field name', () => {
    const body = {
      detail: [
        { type: 'missing', loc: ['body', 'request_body', 'login'], msg: 'Field required' },
      ],
    }
    expect(parseApiError(body, 422)).toEqual({
      message: 'Field required',
      fields: { login: 'Field required' },
    })
  })

  // A duplicate login is caught by a UniqueConstraint in the database, not by a
  // field validator, so it arrives with no field attached.
  it('puts an integrity error under the non-field key', () => {
    const body = {
      detail: [
        {
          type: 'validation_error',
          loc: ['body', 'request_body', '__all__'],
          msg: 'A user with that username already exists.',
          ctx: { key: 'integrity_error' },
        },
      ],
    }
    expect(parseApiError(body, 422)).toEqual({
      message: 'A user with that username already exists.',
      fields: { [NON_FIELD]: 'A user with that username already exists.' },
    })
  })

  it('collects several fields and joins their messages', () => {
    const body = {
      detail: [
        { type: 'missing', loc: ['body', 'request_body', 'login'], msg: 'Field required' },
        { type: 'value_error', loc: ['body', 'request_body', 'email'], msg: 'not an email' },
      ],
    }
    expect(parseApiError(body, 422)).toEqual({
      message: 'Field required not an email',
      fields: { login: 'Field required', email: 'not an email' },
    })
  })

  it('joins two messages aimed at the same field', () => {
    const body = {
      detail: [
        { loc: ['body', 'request_body', 'login'], msg: 'too short' },
        { loc: ['body', 'request_body', 'login'], msg: 'bad characters' },
      ],
    }
    expect(parseApiError(body, 422).fields).toEqual({ login: 'too short bad characters' })
  })

  it('falls back to the status when the body is unusable', () => {
    expect(parseApiError(null, 500)).toEqual({ message: 'Error 500' })
    expect(parseApiError({}, 502)).toEqual({ message: 'Error 502' })
    expect(parseApiError('<html>gateway</html>', 504)).toEqual({ message: 'Error 504' })
    expect(parseApiError({ detail: [] }, 422)).toEqual({ message: 'Error 422' })
  })
})

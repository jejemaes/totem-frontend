import { describe, expect, it } from 'vitest'

import { avatarUrl, lastFirstName, type UserRow } from './users'

function user(fields: Partial<UserRow>): UserRow {
  return {
    id: '1',
    login: 'jdoe',
    email: null,
    first_name: null,
    last_name: null,
    is_active: true,
    roles: null,
    ...fields,
  }
}

describe('lastFirstName', () => {
  it('reads the last name first', () => {
    expect(lastFirstName(user({ first_name: 'Ada', last_name: 'Lovelace' }))).toBe('Lovelace Ada')
  })

  it('keeps the one name set', () => {
    expect(lastFirstName(user({ first_name: 'Ada' }))).toBe('Ada')
    expect(lastFirstName(user({ last_name: 'Lovelace', first_name: '' }))).toBe('Lovelace')
  })

  it('falls back to the login', () => {
    expect(lastFirstName(user({}))).toBe('jdoe')
  })
})

describe('avatarUrl', () => {
  it('accepts an absolute or a root-relative URL', () => {
    expect(avatarUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(avatarUrl('/media/private/a.png?signature=x')).toBe('/media/private/a.png?signature=x')
  })

  it('refuses the bare stored path the list route answers', () => {
    expect(avatarUrl('user.User/42/avatar.png')).toBeNull()
  })

  it('refuses a protocol-relative URL, a script URL, and anything not a string', () => {
    expect(avatarUrl('//evil.example.com/a.png')).toBeNull()
    expect(avatarUrl('javascript:alert(1)')).toBeNull()
    expect(avatarUrl('')).toBeNull()
    expect(avatarUrl(null)).toBeNull()
    expect(avatarUrl(undefined)).toBeNull()
  })
})

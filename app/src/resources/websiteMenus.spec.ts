import { describe, expect, it } from 'vitest'

import { isMenuDescendant, menuTargetPayload, type WebsiteMenuRef } from './websiteMenus'

describe('menuTargetPayload', () => {
  it('keeps the active target and clears the other one', () => {
    expect(menuTargetPayload('page', { page: '01PAGE', link: null })).toEqual({
      page: '01PAGE',
      link: null,
    })
    expect(menuTargetPayload('link', { page: null, link: 'https://x' })).toEqual({
      page: null,
      link: 'https://x',
    })
  })

  /*
   * The switch, in both directions. Without the explicit null, `exclude_unset`
   * leaves the abandoned target in place: the check constraint is "at least
   * one", so the backend accepts both and the item keeps a dead target.
   */
  it('clears the abandoned target when the type switches', () => {
    // Was a page, becomes a link.
    expect(menuTargetPayload('link', { page: '01PAGE', link: 'https://x' })).toEqual({
      page: null,
      link: 'https://x',
    })
    // Was a link, becomes a page.
    expect(menuTargetPayload('page', { page: '01PAGE', link: 'https://x' })).toEqual({
      page: '01PAGE',
      link: null,
    })
  })

  it('clears both when the active target was emptied', () => {
    // A root item legitimately has no target at all.
    expect(menuTargetPayload('page', { page: null, link: null })).toEqual({
      page: null,
      link: null,
    })
    expect(menuTargetPayload('link', { page: null, link: null })).toEqual({
      page: null,
      link: null,
    })
  })
})

describe('isMenuDescendant', () => {
  const ref = (id: string, parentPath?: string): WebsiteMenuRef => ({
    id,
    name: id,
    parent_path: parentPath,
  })

  it('rejects the item itself', () => {
    // Its own id is in its own path, so both the shortcut and the path test
    // must agree.
    expect(isMenuDescendant(ref('B', 'A/B/'), 'B')).toBe(true)
    expect(isMenuDescendant(ref('B'), 'B')).toBe(true)
  })

  it('rejects a child and a deeper descendant', () => {
    expect(isMenuDescendant(ref('C', 'A/B/C/'), 'B')).toBe(true)
    expect(isMenuDescendant(ref('D', 'A/B/C/D/'), 'B')).toBe(true)
  })

  it('accepts an ancestor, a sibling and a cousin', () => {
    expect(isMenuDescendant(ref('A', 'A/'), 'B')).toBe(false)
    expect(isMenuDescendant(ref('X', 'A/X/'), 'B')).toBe(false)
    expect(isMenuDescendant(ref('Y', 'Z/Y/'), 'B')).toBe(false)
  })

  it('does not match an id that merely shares a prefix', () => {
    // The reason the test is framed by slashes: ULIDs share their leading
    // characters, since they start with a timestamp.
    expect(isMenuDescendant(ref('C', '01ABCDEF/C/'), '01AB')).toBe(false)
    expect(isMenuDescendant(ref('C', '01AB/C/'), '01AB')).toBe(true)
  })

  it('keeps a candidate whose path was not requested', () => {
    // Better to offer a parent the backend refuses than to hide a valid one.
    expect(isMenuDescendant(ref('C'), 'B')).toBe(false)
    expect(isMenuDescendant(ref('C', ''), 'B')).toBe(false)
  })

  it('judges nothing while creating, when there is no id yet', () => {
    expect(isMenuDescendant(ref('C', 'A/B/C/'), '')).toBe(false)
  })
})

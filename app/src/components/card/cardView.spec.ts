import { describe, expect, it, vi } from 'vitest'

import {
  cardMenuItems,
  isInteractiveTarget,
  paginatorTemplate,
  requestedCardFields,
  showPaginator,
} from './cardView'
import type { CardMenuItem } from './fields/types'

type Doc = { id: string; state: string }

describe('requestedCardFields', () => {
  it('asks for id first, then each key once', () => {
    expect(requestedCardFields(new Set(['name', 'tags']), ['state', 'name'])).toEqual([
      'id',
      'name',
      'tags',
      'state',
    ])
  })

  it('asks for id even with nothing declared', () => {
    expect(requestedCardFields([])).toEqual(['id'])
  })
})

describe('cardMenuItems', () => {
  const draft: Doc = { id: '1', state: 'draft' }
  const done: Doc = { id: '2', state: 'done' }

  it('binds each command to the record the menu opened on', () => {
    const rename = vi.fn()
    const [item] = cardMenuItems<Doc>([{ label: 'Rename', command: rename }], draft)
    item.command!({} as never)
    expect(rename).toHaveBeenCalledWith(draft)
  })

  it('asks each condition of this record', () => {
    const items: CardMenuItem<Doc>[] = [
      { label: 'Open' },
      { label: 'Publish', condition: (doc) => doc.state === 'draft' },
    ]
    expect(cardMenuItems(items, draft).map((item) => item.label)).toEqual(['Open', 'Publish'])
    expect(cardMenuItems(items, done).map((item) => item.label)).toEqual(['Open'])
  })

  it('drops the separators left with nothing to separate', () => {
    const items: CardMenuItem<Doc>[] = [
      { separator: true },
      { label: 'Open' },
      { separator: true },
      { label: 'Publish', condition: (doc) => doc.state === 'draft' },
      { separator: true },
      { label: 'Delete' },
      { separator: true },
    ]
    expect(cardMenuItems(items, done).map((item) => item.label ?? '---')).toEqual([
      'Open',
      '---',
      'Delete',
    ])
  })

  it('answers an empty menu when every entry is hidden', () => {
    expect(cardMenuItems<Doc>([{ label: 'X', condition: () => false }], draft)).toEqual([])
  })
})

describe('paginator', () => {
  it('lays out a compact or a full pager', () => {
    expect(paginatorTemplate('compact')).not.toContain('RowsPerPageDropdown')
    expect(paginatorTemplate('full')).toContain('RowsPerPageDropdown')
  })

  it('hides a compact pager with one page, never a full one', () => {
    expect(showPaginator('compact', 5, 12)).toBe(false)
    expect(showPaginator('compact', 13, 12)).toBe(true)
    expect(showPaginator('full', 5, 12)).toBe(true)
    expect(showPaginator('none', 500, 12)).toBe(false)
  })
})

describe('isInteractiveTarget', () => {
  const card = { name: 'card' }

  function target(hit: unknown): { closest(selector: string): unknown } {
    return { closest: () => hit }
  }

  it('keeps a click on a button, a link or the menu for itself', () => {
    expect(isInteractiveTarget(target({ name: 'button' }), card)).toBe(true)
  })

  it('lets a click on the card itself through', () => {
    expect(isInteractiveTarget(target(card), card)).toBe(false)
    expect(isInteractiveTarget(target(null), card)).toBe(false)
  })

  it('lets anything without `closest` through -- a text node', () => {
    expect(isInteractiveTarget({}, card)).toBe(false)
    expect(isInteractiveTarget(null, card)).toBe(false)
  })
})

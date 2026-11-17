import { describe, expect, it, vi } from 'vitest'

import type { ActionEntry, RecordAction } from '@/components/actions/actions'

import {
  cardMenuItems,
  isInteractiveTarget,
  paginatorTemplate,
  requestedCardFields,
  showPaginator,
} from './cardView'

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
  const ALL = (): boolean => true

  function action(key: string, extra: Partial<RecordAction<Doc>> = {}): RecordAction<Doc> {
    return { key, label: key, run: () => undefined, ...extra }
  }

  it('hands each entry to the runner with the record the menu opened on', () => {
    const execute = vi.fn()
    const rename = action('rename')
    const [item] = cardMenuItems<Doc>([rename], draft, ALL, execute)
    item.command!({} as never)
    expect(execute).toHaveBeenCalledWith(rename, draft)
  })

  it('keeps the entries visibleActions keeps, separators as menu rules', () => {
    const entries: ActionEntry<Doc>[] = [
      action('open'),
      { separator: true },
      action('publish', { condition: (doc) => doc.state === 'draft' }),
      { separator: true },
      action('delete', { icon: 'pi pi-trash' }),
    ]
    const items = cardMenuItems(entries, done, ALL, vi.fn())
    expect(items.map((item) => (item.separator ? '---' : item.label))).toEqual([
      'open',
      '---',
      'delete',
    ])
    expect(items[2].icon).toBe('pi pi-trash')
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

import { describe, expect, it } from 'vitest'

import { visibleActions, visibleButtons, type ActionEntry, type RecordAction } from './actions'

type Doc = { id: string; state: string }

const draft: Doc = { id: '1', state: 'draft' }
const done: Doc = { id: '2', state: 'done' }

const ALL = (): boolean => true

function action(key: string, extra: Partial<RecordAction<Doc>> = {}): RecordAction<Doc> {
  return { key, label: key, run: () => undefined, ...extra }
}

function labels(entries: ActionEntry<Doc>[]): string[] {
  return entries.map((entry) => ('separator' in entry ? '---' : entry.label))
}

describe('visibleActions', () => {
  it('shows nothing on an empty set', () => {
    expect(visibleActions([action('open')], [], ALL)).toEqual([])
  })

  it('asks each condition of the record', () => {
    const entries = [action('open'), action('publish', { condition: (d) => d.state === 'draft' })]
    expect(labels(visibleActions(entries, [draft], ALL))).toEqual(['open', 'publish'])
    expect(labels(visibleActions(entries, [done], ALL))).toEqual(['open'])
  })

  it('hides an action whose permission is not held', () => {
    const entries = [action('open'), action('archive', { permission: 'totem.doc.update' })]
    expect(labels(visibleActions(entries, [draft], () => false))).toEqual(['open'])
    expect(labels(visibleActions(entries, [draft], (p) => p === 'totem.doc.update'))).toEqual([
      'open',
      'archive',
    ])
  })

  it('offers only the multi actions on several records', () => {
    const entries = [action('rename'), action('archive', { multi: true })]
    expect(labels(visibleActions(entries, [draft, done], ALL))).toEqual(['archive'])
    // One record of a selection is still a single record.
    expect(labels(visibleActions(entries, [draft], ALL))).toEqual(['rename', 'archive'])
  })

  it('requires the condition of EVERY selected record', () => {
    const entries = [action('publish', { multi: true, condition: (d) => d.state === 'draft' })]
    expect(visibleActions(entries, [draft, done], ALL)).toEqual([])
    expect(labels(visibleActions(entries, [draft, { ...draft, id: '3' }], ALL))).toEqual([
      'publish',
    ])
  })

  it('drops the separators left with nothing to separate', () => {
    const entries: ActionEntry<Doc>[] = [
      { separator: true },
      action('open'),
      { separator: true },
      action('publish', { condition: (d) => d.state === 'draft' }),
      { separator: true },
      action('delete'),
      { separator: true },
    ]
    expect(labels(visibleActions(entries, [done], ALL))).toEqual(['open', '---', 'delete'])
  })

  it('answers nothing when every action is hidden', () => {
    const entries: ActionEntry<Doc>[] = [{ separator: true }, action('x', { condition: () => false })]
    expect(visibleActions(entries, [draft], ALL)).toEqual([])
  })
})

describe('visibleButtons', () => {
  it('leaves the separators out', () => {
    const entries: ActionEntry<Doc>[] = [action('open'), { separator: true }, action('delete')]
    expect(visibleButtons(entries, [draft], ALL).map((a) => a.key)).toEqual(['open', 'delete'])
  })
})

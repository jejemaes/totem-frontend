import { describe, expect, it } from 'vitest'

import {
  publishRecordSet,
  readRecordSet,
  recordPosition,
  recordSetState,
  RECORD_SET_STATE_KEY,
  stepRecord,
  takeRecordSet,
} from './recordSet'

const IDS = ['a', 'b', 'c']

describe('stepRecord', () => {
  it('moves to the neighbour', () => {
    expect(stepRecord(IDS, 'a', 1)).toBe('b')
    expect(stepRecord(IDS, 'c', -1)).toBe('b')
  })

  it('wraps at both ends', () => {
    expect(stepRecord(IDS, 'c', 1)).toBe('a')
    expect(stepRecord(IDS, 'a', -1)).toBe('c')
  })

  it('steps a one-record set onto itself', () => {
    expect(stepRecord(['a'], 'a', 1)).toBe('a')
    expect(stepRecord(['a'], 'a', -1)).toBe('a')
  })

  it('answers an id outside the set with itself', () => {
    expect(stepRecord(IDS, 'z', 1)).toBe('z')
  })
})

describe('recordPosition', () => {
  it('locates the id', () => {
    expect(recordPosition(IDS, 'b')).toEqual({ index: 1, total: 3 })
  })

  it('is null for an id outside the set', () => {
    expect(recordPosition(IDS, 'z')).toBeNull()
  })
})

describe('readRecordSet', () => {
  it('reads a set stamped during this page load', () => {
    const state = { back: '/contacts', [RECORD_SET_STATE_KEY]: recordSetState(IDS, 'boot-1') }
    expect(readRecordSet(state, 'boot-1')).toEqual(IDS)
  })

  it('ignores a set stamped before a reload', () => {
    const state = { [RECORD_SET_STATE_KEY]: recordSetState(IDS, 'boot-1') }
    expect(readRecordSet(state, 'boot-2')).toBeNull()
  })

  it.each([
    null,
    'x',
    {},
    { [RECORD_SET_STATE_KEY]: null },
    { [RECORD_SET_STATE_KEY]: { boot: 'boot-1', ids: 'a,b' } },
    { [RECORD_SET_STATE_KEY]: { boot: 'boot-1', ids: [] } },
    { [RECORD_SET_STATE_KEY]: { boot: 'boot-1', ids: ['a', 2] } },
  ])('rejects %j', (state) => {
    expect(readRecordSet(state, 'boot-1')).toBeNull()
  })
})

describe('takeRecordSet', () => {
  it('hands the set to a record of the list that published it', () => {
    publishRecordSet('/contacts', IDS)
    expect(takeRecordSet('/contacts', 'b')).toEqual(IDS)
  })

  it('refuses a navigation from elsewhere', () => {
    publishRecordSet('/contacts', IDS)
    expect(takeRecordSet('/', 'b')).toBeNull()
  })

  it('refuses a record outside the set', () => {
    publishRecordSet('/contacts', IDS)
    expect(takeRecordSet('/contacts', 'z')).toBeNull()
  })

  it('keeps its own copy of the ids', () => {
    const ids = ['a', 'b']
    publishRecordSet('/contacts', ids)
    ids.push('c')
    expect(takeRecordSet('/contacts', 'c')).toBeNull()
  })
})

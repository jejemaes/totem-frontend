import { describe, expect, it } from 'vitest'

import {
  BREADCRUMB_STATE_KEY,
  crumbState,
  publishCrumbs,
  readCrumbs,
  takeCrumbs,
  unpublishCrumbs,
} from './breadcrumbs'

const CHAIN = [
  { label: 'Budgets', to: '/accounting/budgets?page=2' },
  { label: 'Budget X', to: '/accounting/budgets/7' },
]

describe('crumbState / readCrumbs', () => {
  it('round-trips a chain', () => {
    expect(readCrumbs(crumbState(CHAIN))).toEqual(CHAIN)
  })

  it('reads the trail beside vue-router own keys', () => {
    const state = { back: '/a', current: '/b', position: 3, ...crumbState(CHAIN) }
    expect(readCrumbs(state)).toEqual(CHAIN)
  })

  it('copies the crumbs, dropping any extra key', () => {
    const crumb = { label: 'Budgets', to: '/accounting/budgets', extra: 1 }
    const state = crumbState([crumb])
    expect(state[BREADCRUMB_STATE_KEY]).toEqual([{ label: 'Budgets', to: '/accounting/budgets' }])
    expect(state[BREADCRUMB_STATE_KEY][0]).not.toBe(crumb)
  })
})

describe('readCrumbs', () => {
  it('answers null without a state', () => {
    expect(readCrumbs(null)).toBeNull()
    expect(readCrumbs(undefined)).toBeNull()
    expect(readCrumbs('trail')).toBeNull()
  })

  it('answers null without a trail', () => {
    expect(readCrumbs({ back: '/a', current: '/b' })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [] })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: 'Budgets' })).toBeNull()
  })

  it('refuses a crumb without a label or a target', () => {
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [{ to: '/a' }] })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [{ label: '', to: '/a' }] })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [{ label: 'A' }] })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [null] })).toBeNull()
  })

  it('refuses the whole trail when one crumb is malformed', () => {
    const chain = [...CHAIN, { label: 'Broken', to: 42 }]
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: chain })).toBeNull()
  })

  it('refuses a target outside the app', () => {
    const absolute = [{ label: 'A', to: 'https://x.test/' }]
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: absolute })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [{ label: 'A', to: '//x.test/' }] })).toBeNull()
    expect(readCrumbs({ [BREADCRUMB_STATE_KEY]: [{ label: 'A', to: 'budgets' }] })).toBeNull()
  })
})

describe('publishCrumbs / takeCrumbs', () => {
  const FALLBACK = { label: 'Movements', to: '/accounting/accounts/3/movements?page=2' }

  it('falls back to the origin alone when nothing is published', () => {
    unpublishCrumbs('/accounting/budgets')
    expect(takeCrumbs('/accounting/budgets', FALLBACK)).toEqual([FALLBACK])
  })

  it('takes the chain published by the origin page', () => {
    publishCrumbs('/accounting/accounts/3/movements', CHAIN)
    expect(takeCrumbs('/accounting/accounts/3/movements', FALLBACK)).toEqual(CHAIN)
  })

  it('ignores a chain published by another page', () => {
    publishCrumbs('/accounting/accounts/3/movements', CHAIN)
    expect(takeCrumbs('/accounting/budgets', FALLBACK)).toEqual([FALLBACK])
  })

  it('hands out copies, never the published chain itself', () => {
    publishCrumbs('/a', CHAIN)
    const taken = takeCrumbs('/a', FALLBACK)
    taken[0].label = 'Changed'
    expect(takeCrumbs('/a', FALLBACK)).toEqual(CHAIN)
  })

  it('unpublishes only its own path', () => {
    publishCrumbs('/a', CHAIN)
    unpublishCrumbs('/b')
    expect(takeCrumbs('/a', FALLBACK)).toEqual(CHAIN)
    unpublishCrumbs('/a')
    expect(takeCrumbs('/a', FALLBACK)).toEqual([FALLBACK])
  })
})

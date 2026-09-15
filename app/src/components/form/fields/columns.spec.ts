import { describe, expect, it } from 'vitest'

import {
  COLUMN_SPLITS,
  COL_CLASS,
  DEFAULT_SPLIT,
  ROW_CLASS,
  rowClass,
  splitFromClass,
  toSplit,
  type ColumnSplit,
} from './columns'

const SPLITS = COLUMN_SPLITS.map((entry) => entry.value)

describe('the vocabulary', () => {
  it('is closed and has no duplicate', () => {
    expect(new Set(SPLITS).size).toBe(SPLITS.length)
  })

  it('labels every split', () => {
    for (const entry of COLUMN_SPLITS) expect(entry.label).not.toBe('')
  })

  it('holds the default', () => {
    expect(SPLITS).toContain(DEFAULT_SPLIT)
  })

  // The class names are a contract with two stylesheets that cannot import
  // them -- the public site's content.css and HtmlField's own scoped block --
  // so a rename has to break a test rather than a page.
  it('names the classes the stylesheets key off', () => {
    expect(ROW_CLASS).toBe('t-row')
    expect(COL_CLASS).toBe('t-col')
  })
})

describe('rowClass', () => {
  it('always emits the modifier, the default included', () => {
    expect(rowClass('1-1')).toBe('t-row t-row--1-1')
  })

  it.each(SPLITS)('emits %s', (split) => {
    expect(rowClass(split)).toBe(`t-row t-row--${split}`)
  })

  it.each([
    ['an unknown ratio', '3-1'],
    ['the empty string', ''],
    ['null', null],
    ['a number', 12],
  ])('falls back to the default for %s', (_label, value) => {
    expect(rowClass(value)).toBe(`t-row t-row--${DEFAULT_SPLIT}`)
  })
})

describe('splitFromClass', () => {
  it.each(SPLITS)('round-trips %s through rowClass', (split) => {
    expect(splitFromClass(rowClass(split))).toBe(split)
  })

  it('reads a row that carries unrelated classes too', () => {
    expect(splitFromClass('mb-3 t-row t-row--2-1 shadow')).toBe('2-1')
  })

  // A row saved before the modifier existed, or one hand-written in the source
  // view. It has to render, so it reads as the default rather than as nothing.
  it('falls back for a row with no modifier', () => {
    expect(splitFromClass('t-row')).toBe(DEFAULT_SPLIT)
  })

  it('does not match a modifier the stylesheet does not define', () => {
    expect(splitFromClass('t-row t-row--5-1')).toBe(DEFAULT_SPLIT)
  })

  // The whitespace split is what stops a prefix from matching: a substring test
  // would read `t-row--1-1x` as `1-1` and lay the block out wrongly.
  it('does not match a class that merely starts with one', () => {
    expect(splitFromClass('t-row t-row--1-2x')).toBe(DEFAULT_SPLIT)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 3],
    ['an object', {}],
  ])('never throws on %s', (_label, value) => {
    expect(splitFromClass(value)).toBe(DEFAULT_SPLIT)
  })
})

describe('toSplit', () => {
  it.each(SPLITS)('keeps %s', (split) => {
    expect(toSplit(split)).toBe(split)
  })

  it('narrows anything else to the default', () => {
    const unknown: unknown = '9-9'
    const narrowed: ColumnSplit = toSplit(unknown)
    expect(narrowed).toBe(DEFAULT_SPLIT)
  })
})

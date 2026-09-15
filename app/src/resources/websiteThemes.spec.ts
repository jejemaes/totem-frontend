import { describe, expect, it } from 'vitest'

import { displayLayout, displayTheme, toLayouts, toThemes } from './websiteThemes'

/*
 * `listWebsiteLayouts` itself is one apiFetch call with a literal path, and
 * there is no fetch mocking anywhere in this suite -- the two decisions it
 * carries are exported instead, exactly as websiteWidgets does next door.
 */
const LAYOUT = { id: 'sidebar-left', title: 'Sidebar Left' }

describe('toLayouts', () => {
  it('reads the bare array the route answers today', () => {
    expect(toLayouts([LAYOUT])).toEqual([LAYOUT])
  })

  /*
   * The route is a hand-written @route.get returning List[...], so it is NOT
   * paginated -- but every other list route in the app is. If this one ever
   * grows the envelope, the picker must not silently come up empty.
   */
  it('reads the paginated envelope too, should the route ever grow one', () => {
    expect(toLayouts({ count: 1, next: null, previous: null, results: [LAYOUT] })).toEqual([LAYOUT])
  })

  it('reads an empty page as an empty vocabulary, not as a failure', () => {
    expect(toLayouts({ count: 0, results: [] })).toEqual([])
    expect(toLayouts([])).toEqual([])
  })

  it.each([
    ['an error body', { detail: 'nope' }],
    ['an envelope whose results is not a list', { results: 'nope' }],
    ['null', null],
    ['a string', 'nope'],
    ['undefined', undefined],
  ])('answers an empty vocabulary for %s', (_label, payload) => {
    expect(toLayouts(payload)).toEqual([])
  })
})

describe('displayLayout', () => {
  it('shows the title', () => {
    expect(displayLayout(LAYOUT)).toBe('Sidebar Left')
  })

  it('trims it', () => {
    expect(displayLayout({ id: 'narrow', title: '  Narrow  ' })).toBe('Narrow')
  })

  /*
   * NOT a last resort: the page detail carries the layout as a bare id, so this
   * is what labels the current value until the vocabulary has been loaded.
   */
  it('falls back to the id, which is always there', () => {
    expect(displayLayout({ id: 'full-width' })).toBe('full-width')
    expect(displayLayout({ id: 'full-width', title: '   ' })).toBe('full-width')
    expect(displayLayout({ id: 'full-width', title: 42 })).toBe('full-width')
  })
})

/*
 * The theme catalogue shares `toRegistry` with the layouts, so this only pins
 * that the two entry points are really wired to it -- the tolerance itself is
 * covered above.
 */
describe('toThemes', () => {
  const THEME = { id: 'default', title: 'Default', layouts: ['narrow'], option_schema: {} }

  it('reads the bare array, and the envelope', () => {
    expect(toThemes([THEME])).toEqual([THEME])
    expect(toThemes({ count: 1, results: [THEME] })).toEqual([THEME])
    expect(toThemes({ detail: 'nope' })).toEqual([])
  })
})

describe('displayTheme', () => {
  it('shows the title, and falls back to the id', () => {
    expect(displayTheme({ id: 'default', title: 'Default' })).toBe('Default')
    expect(displayTheme({ id: 'default' })).toBe('default')
  })
})

import { describe, expect, it } from 'vitest'

import { toWidgetTypes } from './websiteWidgets'

/*
 * Only the shape tolerance is testable, and it is the only part worth testing:
 * `fetchWebsiteWidgets` itself is one apiFetch call with a literal path, and
 * there is no fetch mocking anywhere in this suite -- the logic is exported
 * instead, the same way `isDisplayableImage` is next door.
 */
const TYPE = { id: 'last-page', title: 'Last Updated Pages', attribute_schema: {} }

describe('toWidgetTypes', () => {
  it('reads the bare array the route answers today', () => {
    expect(toWidgetTypes([TYPE])).toEqual([TYPE])
  })

  /*
   * The route is a hand-written @route.get returning List[...], so it is NOT
   * paginated -- but every other list route in the app is. If this one ever
   * grows the envelope, the editor must not silently show "no widget
   * available": an envelope is a valid object that simply has no length.
   */
  it('reads the paginated envelope too, should the route ever grow one', () => {
    expect(toWidgetTypes({ count: 1, next: null, previous: null, results: [TYPE] })).toEqual([TYPE])
  })

  it('reads an empty page as an empty catalogue, not as a failure', () => {
    expect(toWidgetTypes({ count: 0, results: [] })).toEqual([])
    expect(toWidgetTypes([])).toEqual([])
  })

  it.each([
    ['an error body', { detail: 'nope' }],
    ['an envelope whose results is not a list', { results: 'nope' }],
    ['null', null],
    ['a string', 'nope'],
    ['undefined', undefined],
  ])('answers an empty catalogue for %s', (_label, payload) => {
    expect(toWidgetTypes(payload)).toEqual([])
  })
})

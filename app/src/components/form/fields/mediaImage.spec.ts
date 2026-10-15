import { describe, expect, it } from 'vitest'

import {
  coverImageFor,
  coverLabel,
  oversizeMessage,
  toImageItem,
  uploadedImageItem,
} from './mediaImage'

/*
 * What is NOT tested here, and why: MediaImageField.vue itself (this suite runs
 * in `node`, with no jsdom and no @vue/test-utils -- the whole reason this
 * module exists), HtmlImagePicker (unchanged, and its browse machinery is its
 * own), the upload request (there is no fetch mocking anywhere in this repo),
 * and the permission gates (`can()` reads a Pinia store and needs an app).
 */

/** The website payload's shape: MediaDisplayNameSchema, URL under `content`. */
const NESTED = { id: '01H', name: 'hero.png', content: '/media/public/hero.png', mimetype: 'image/png' }

/** The picker's shape, and the upload result's: URL under `url`. */
const PICKED = { id: '01H', name: 'hero.png', url: '/media/public/hero.png', mimetype: 'image/png' }

describe('toImageItem', () => {
  it('reads the shape the API nests, whose URL key is `content`', () => {
    expect(toImageItem(NESTED)).toEqual({
      id: '01H',
      url: '/media/public/hero.png',
      name: 'hero.png',
      mimetype: 'image/png',
    })
  })

  it('reads the shape the picker emits, whose URL key is `url`', () => {
    expect(toImageItem(PICKED)).toEqual({
      id: '01H',
      url: '/media/public/hero.png',
      name: 'hero.png',
      mimetype: 'image/png',
    })
  })

  /* A record carrying both has already been through here once. */
  it('prefers `url` when a record carries both', () => {
    expect(toImageItem({ id: '1', url: '/from-url.png', content: '/from-content.png' })?.url).toBe(
      '/from-url.png',
    )
  })

  it('stringifies a numeric id', () => {
    expect(toImageItem({ id: 7, url: '/a.png' })?.id).toBe('7')
  })

  /*
   * Both halves are required: an entry with no id could not be stored, and one
   * with no URL has nothing to show. Half an item would only move the check
   * into the template, where it shows up as a broken-image glyph.
   */
  it.each([
    ['no id', { url: '/a.png' }],
    ['an empty id', { id: '', url: '/a.png' }],
    ['an id that is neither string nor number', { id: { nope: 1 }, url: '/a.png' }],
    ['no URL at all', { id: '1', name: 'hero.png' }],
    ['an empty URL', { id: '1', url: '   ' }],
    ['a null content', { id: '1', content: null }],
  ])('answers null for %s', (_label, record) => {
    expect(toImageItem(record)).toBeNull()
  })

  it.each([['null', null], ['undefined', undefined], ['a string', 'nope'], ['an array', []]])(
    'answers null for %s',
    (_label, record) => {
      expect(toImageItem(record)).toBeNull()
    },
  )

  it('falls back to the id when the record names nothing', () => {
    expect(toImageItem({ id: '01H', url: '/a.png' })?.name).toBe('01H')
    expect(toImageItem({ id: '01H', url: '/a.png', name: '   ' })?.name).toBe('01H')
    expect(toImageItem({ id: '01H', url: '/a.png', name: 42 })?.name).toBe('01H')
  })

  it('carries a missing mimetype as null rather than inventing one', () => {
    expect(toImageItem({ id: '1', url: '/a.png' })?.mimetype).toBeNull()
    expect(toImageItem({ id: '1', url: '/a.png', mimetype: null })?.mimetype).toBeNull()
  })
})

describe('coverImageFor', () => {
  /*
   * THE case this function exists for: `options.record` describes the record
   * the form LOADED, so right after a pick it describes the previous value. A
   * stale record labelling the new one is the "I chose an image and it kept
   * showing the old one" bug.
   */
  it('refuses a record that does not describe the value', () => {
    expect(coverImageFor('02B', NESTED)).toBeNull()
  })

  it('accepts the record that does', () => {
    expect(coverImageFor('01H', NESTED)?.url).toBe('/media/public/hero.png')
  })

  /* The draft may well carry a numeric id as a string: the comparison is on the
     string form, which is `relationRecordFor`'s own rule. */
  it('matches on the string form of the id', () => {
    expect(coverImageFor('5', { id: 5, url: '/a.png' })?.id).toBe('5')
    expect(coverImageFor(5, { id: '5', url: '/a.png' })?.id).toBe('5')
  })

  it.each([['null', null], ['an empty string', ''], ['undefined', undefined]])(
    'answers null for a value of %s, whatever the record says',
    (_label, value) => {
      expect(coverImageFor(value as never, NESTED)).toBeNull()
    },
  )

  it('answers null when there is no record at all', () => {
    expect(coverImageFor('01H', null)).toBeNull()
  })
})

describe('coverLabel', () => {
  it('shows the image name', () => {
    expect(coverLabel('01H', toImageItem(NESTED))).toBe('hero.png')
  })

  /* A poor label, but the truth: an empty-looking field over a stored value is
     the failure to avoid. */
  it('falls back to the raw id when nothing describes the value', () => {
    expect(coverLabel('01HXYZ', null)).toBe('01HXYZ')
  })

  it('shows an em dash when there is no value', () => {
    expect(coverLabel(null, null)).toBe('—')
    expect(coverLabel('', null)).toBe('—')
  })
})

describe('uploadedImageItem', () => {
  const file = { name: 'from-disk.png' }

  it('takes the id the store returned', () => {
    expect(uploadedImageItem({ id: '01H', url: '/a.png', name: 'a.png' }, file)).toEqual({
      id: '01H',
      url: '/a.png',
      name: 'a.png',
      mimetype: null,
    })
  })

  it("names it after the picked file when the store did not", () => {
    expect(uploadedImageItem({ id: '01H', url: '/a.png' }, file)?.name).toBe('from-disk.png')
  })

  /*
   * A field whose value is an id cannot fall back to the URL -- that would
   * write a path into a foreign key column. Null here is what makes the widget
   * SAY the upload could not become the value, instead of storing nonsense.
   */
  it.each([
    ['no id', { url: '/a.png' }],
    ['an empty id', { id: '', url: '/a.png' }],
  ])('answers null for a result with %s', (_label, result) => {
    expect(uploadedImageItem(result, file)).toBeNull()
  })

  it.each([['null', null], ['undefined', undefined]])('answers null for %s', (_label, result) => {
    expect(uploadedImageItem(result, file)).toBeNull()
  })
})

describe('oversizeMessage', () => {
  it('names both sizes when the file is too large', () => {
    expect(oversizeMessage({ size: 3072 }, 2048)).toBe(
      'This image is too large (3 kB). The limit is 2 kB.',
    )
  })

  it('says nothing for a file at or under the limit', () => {
    expect(oversizeMessage({ size: 2048 }, 2048)).toBeNull()
    expect(oversizeMessage({ size: 1 }, 2048)).toBeNull()
  })

  /* No limit configured means no check -- never "refuse everything". */
  it.each([['0', 0], ['a negative', -1], ['undefined', undefined], ['null', null], ['a string', 'big']])(
    'says nothing when the limit is %s',
    (_label, max) => {
      expect(oversizeMessage({ size: 10 ** 9 }, max)).toBeNull()
    },
  )
})

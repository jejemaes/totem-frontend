import { describe, expect, it } from 'vitest'

import {
  countThemeOptions,
  humanizeOptionName,
  readThemeOptionSchema,
  sameThemeOptions,
  splitThemeOptionErrors,
  themeOptionValues,
  withThemeOption,
} from './websiteThemeOptions'

/*
 * The fixture is the REAL payload: `DefaultTheme.Options.model_json_schema()`,
 * copied from what `/website/themes/` answers. A hand-simplified schema would
 * quietly stop exercising the `anyOf [T, null]` wrapper pydantic puts around
 * every `Optional` -- which is the shape the whole module is built to unwrap.
 */
const DEFAULT_THEME_SCHEMA = {
  additionalProperties: false,
  title: 'Options',
  type: 'object',
  properties: {
    color_primary: {
      anyOf: [{ pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$', type: 'string' }, { type: 'null' }],
      default: null,
      description: 'Accent colour for links, buttons and the active menu item.',
      title: 'Primary Colour',
    },
    color_body_bg: {
      anyOf: [{ pattern: '^#(?:[0-9a-fA-F]{3})$', type: 'string' }, { type: 'null' }],
      default: null,
      description: 'Page background.',
      title: 'Background Colour',
    },
    font_family_base: {
      anyOf: [{ pattern: "^[A-Za-z0-9 ,'\"-]{1,128}$", type: 'string' }, { type: 'null' }],
      default: null,
      description: 'Body font stack.',
      title: 'Font Family',
    },
    content_max_width: {
      anyOf: [{ pattern: '^-?\\d+(?:\\.\\d+)?(?:px|rem|em|%|vh|vw)$', type: 'string' }, { type: 'null' }],
      default: null,
      description: 'Maximum width of the text column in the narrow layout.',
      title: 'Reading Width',
    },
  },
}

describe('readThemeOptionSchema', () => {
  it('reads the real schema of the default theme', () => {
    const { fields, unsupported } = readThemeOptionSchema(DEFAULT_THEME_SCHEMA)

    expect(unsupported).toEqual([])
    expect(fields.map((field) => field.name)).toEqual([
      'color_primary',
      'color_body_bg',
      'font_family_base',
      'content_max_width',
    ])
    expect(fields[0]).toEqual({
      name: 'color_primary',
      widget: 'string',
      label: 'Primary Colour',
      help: 'Accent colour for links, buttons and the active menu item.',
      options: {},
    })
  })

  /* `properties` is an object literal, so its order is the theme author's own
     declaration order -- and that is the order the form must show. */
  it('keeps the declaration order', () => {
    const { fields } = readThemeOptionSchema({
      properties: { zebra: { type: 'string' }, alpha: { type: 'string' } },
    })
    expect(fields.map((field) => field.name)).toEqual(['zebra', 'alpha'])
  })

  it.each([
    ['a plain string', { type: 'string' }, 'string'],
    ['an optional string', { anyOf: [{ type: 'string' }, { type: 'null' }] }, 'string'],
    ['a boolean', { type: 'boolean' }, 'boolean'],
    ['an integer', { type: 'integer' }, 'integer'],
    ['a number', { type: 'number' }, 'float'],
    ['a date', { type: 'string', format: 'date' }, 'date'],
    ['an instant', { type: 'string', format: 'date-time' }, 'datetime'],
    ['an inline enum', { enum: ['a', 'b'], type: 'string' }, 'selection'],
  ])('maps %s', (_label, property, widget) => {
    const { fields } = readThemeOptionSchema({ properties: { option: property } })
    expect(fields[0]?.widget).toBe(widget)
  })

  it('carries the constraints a widget can honour', () => {
    const { fields } = readThemeOptionSchema({
      properties: {
        label: { type: 'string', maxLength: 40 },
        weight: { type: 'integer', minimum: 100, maximum: 900 },
      },
    })
    expect(fields[0]?.options).toEqual({ maxLength: 40 })
    expect(fields[1]?.options).toEqual({ min: 100, max: 900 })
  })

  /* A pydantic Enum member is a `$ref` into `$defs`, and the wrapper keeps the
     title and the description. Both have to survive the hop. */
  it('follows a $ref into $defs, and the wrapper wins on the label', () => {
    const { fields } = readThemeOptionSchema({
      $defs: { Density: { enum: ['cosy', 'compact'], title: 'Density', type: 'string' } },
      properties: {
        density: {
          anyOf: [{ $ref: '#/$defs/Density' }, { type: 'null' }],
          title: 'Spacing',
          description: 'How tight the rhythm is.',
        },
      },
    })
    expect(fields[0]).toEqual({
      name: 'density',
      widget: 'selection',
      label: 'Spacing',
      help: 'How tight the rhythm is.',
      options: { choices: ['cosy', 'compact'] },
    })
  })

  it('falls back to a humanised name when the schema carries no title', () => {
    const { fields } = readThemeOptionSchema({ properties: { color_primary: { type: 'string' } } })
    expect(fields[0]?.label).toBe('Color primary')
  })

  /*
   * NAMED, never silently dropped: an author must be able to see that the theme
   * declares an option this screen cannot edit -- otherwise the admin claims to
   * show the theme's settings while hiding one.
   */
  it.each([
    ['an object', { type: 'object' }],
    ['an array', { type: 'array', items: { type: 'string' } }],
    ['a union of two real types', { anyOf: [{ type: 'string' }, { type: 'integer' }] }],
    ['a $ref that resolves to nothing', { $ref: '#/$defs/Missing' }],
    ['a node that is not an object', 'nope'],
  ])('reports %s as unsupported', (_label, property) => {
    const form = readThemeOptionSchema({ properties: { option: property } })
    expect(form.fields).toEqual([])
    expect(form.unsupported).toEqual(['option'])
  })

  it.each([
    ['a theme declaring none', { properties: {}, additionalProperties: false }],
    ['a schema with no properties', { type: 'object' }],
    ['null', null],
    ['an array', []],
    ['a string', 'nope'],
    ['undefined', undefined],
  ])('answers an empty form for %s', (_label, schema) => {
    expect(readThemeOptionSchema(schema)).toEqual({ fields: [], unsupported: [] })
  })
})

describe('themeOptionValues', () => {
  const { fields } = readThemeOptionSchema({
    properties: {
      color_primary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      compact: { type: 'boolean' },
      weight: { type: 'integer' },
    },
  })

  it('keeps the values the schema declares', () => {
    expect(themeOptionValues({ color_primary: '#fff', compact: true, weight: 400 }, fields)).toEqual({
      color_primary: '#fff',
      compact: true,
      weight: 400,
    })
  })

  /*
   * The backend's write path is `extra="forbid"`, so echoing back a key from a
   * theme the site has since left is a 422 -- even though its READ path drops
   * that same key without a word.
   */
  it('drops a key the current schema does not declare', () => {
    expect(themeOptionValues({ color_primary: '#fff', from_another_theme: 'x' }, fields)).toEqual({
      color_primary: '#fff',
    })
  })

  it('drops a null, which is how an unset option is stored', () => {
    expect(themeOptionValues({ color_primary: null, compact: false }, fields)).toEqual({
      compact: false,
    })
  })

  it('drops a value of the wrong type rather than coercing it', () => {
    expect(themeOptionValues({ compact: 'yes', weight: 'heavy' }, fields)).toEqual({})
  })

  it.each([[null], [undefined], ['nope'], [[]]])('answers an empty bag for %s', (raw) => {
    expect(themeOptionValues(raw, fields)).toEqual({})
  })
})

describe('withThemeOption', () => {
  it('sets a value without touching the object it was given', () => {
    const before = { color_primary: '#fff' }
    const after = withThemeOption(before, 'font_family_base', 'Inter')

    expect(after).toEqual({ color_primary: '#fff', font_family_base: 'Inter' })
    expect(before).toEqual({ color_primary: '#fff' })
  })

  /* An absent key and a null mean the same thing to the backend, and only the
     absent one survives a round trip unchanged. */
  it.each([[null], [''], [[]]])('removes the key when the value is %s', (value) => {
    expect(withThemeOption({ color_primary: '#fff' }, 'color_primary', value as never)).toEqual({})
  })

  it('keeps `false` and `0`, which are filled values', () => {
    expect(withThemeOption({}, 'compact', false)).toEqual({ compact: false })
    expect(withThemeOption({}, 'weight', 0)).toEqual({ weight: 0 })
  })
})

describe('sameThemeOptions', () => {
  it('ignores key order', () => {
    expect(sameThemeOptions({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
  })

  it('reads an absent key and a null as the same', () => {
    expect(sameThemeOptions({ a: '1' }, { a: '1', b: null })).toBe(true)
    expect(sameThemeOptions({}, {})).toBe(true)
    expect(sameThemeOptions(null, {})).toBe(true)
  })

  it('sees a real change', () => {
    expect(sameThemeOptions({ a: '1' }, { a: '2' })).toBe(false)
    expect(sameThemeOptions({ a: '1' }, {})).toBe(false)
    expect(sameThemeOptions({ compact: false }, {})).toBe(false)
  })
})

describe('countThemeOptions', () => {
  it('counts what is set, nulls excluded', () => {
    expect(countThemeOptions({ a: '1', b: null, c: false })).toBe(2)
    expect(countThemeOptions({})).toBe(0)
    expect(countThemeOptions(null)).toBe(0)
  })
})

describe('splitThemeOptionErrors', () => {
  const NAMES = ['color_primary', 'content_max_width', 'font_family_base']

  /*
   * The exact string `parseApiError` builds: the service reports one
   * "<option>: <message>" per pydantic error, all under the `theme_options`
   * key, and the client joins them with a space.
   */
  it('splits the joined message back onto its options', () => {
    const message =
      "color_primary: String should match pattern '^#...$' " +
      "content_max_width: String should match pattern '^-?\\d+$'"

    expect(splitThemeOptionErrors(message, NAMES)).toEqual({
      fields: {
        color_primary: "String should match pattern '^#...$'",
        content_max_width: "String should match pattern '^-?\\d+$'",
      },
      rest: '',
    })
  })

  it('handles a single refusal', () => {
    expect(splitThemeOptionErrors('color_primary: Input should be a valid string', NAMES)).toEqual({
      fields: { color_primary: 'Input should be a valid string' },
      rest: '',
    })
  })

  /* An extra key the schema does not declare -- what a stale blob produces --
     names no field of this form, so it must stay visible as a banner. */
  it('keeps what it cannot attribute in `rest`', () => {
    expect(splitThemeOptionErrors('nope: Extra inputs are not permitted', NAMES)).toEqual({
      fields: {},
      rest: 'nope: Extra inputs are not permitted',
    })
  })

  it('splits a leading unattributed part from the rest', () => {
    const { fields, rest } = splitThemeOptionErrors(
      'nope: Extra inputs are not permitted color_primary: Input should be a valid string',
      NAMES,
    )
    expect(rest).toBe('nope: Extra inputs are not permitted')
    expect(fields).toEqual({ color_primary: 'Input should be a valid string' })
  })

  /* The anchor is a whole word: a longer name ending in a shorter one must not
     cut the shorter one's message in two. */
  /*
   * The case the demo page surfaced: an option the schema does not declare,
   * AFTER one it does. Anchoring only on known names would glue "nope: …" onto
   * color_primary's message, under a field it says nothing about.
   */
  it('keeps an unknown name that follows a known one out of that field', () => {
    const { fields, rest } = splitThemeOptionErrors(
      "color_primary: String should match pattern '^#...$' nope: Extra inputs are not permitted",
      NAMES,
    )
    expect(fields).toEqual({ color_primary: "String should match pattern '^#...$'" })
    expect(rest).toBe('nope: Extra inputs are not permitted')
  })

  it('does not anchor inside another name', () => {
    expect(splitThemeOptionErrors('theme_color_primary: nope', NAMES)).toEqual({
      fields: {},
      rest: 'theme_color_primary: nope',
    })
  })

  it('joins two refusals on the same option', () => {
    const { fields } = splitThemeOptionErrors(
      'color_primary: too short color_primary: not a colour',
      NAMES,
    )
    expect(fields.color_primary).toBe('too short not a colour')
  })

  it.each([[''], ['   '], [undefined], [null]])('answers nothing for %s', (message) => {
    expect(splitThemeOptionErrors(message, NAMES)).toEqual({ fields: {}, rest: '' })
  })
})

describe('humanizeOptionName', () => {
  it.each([
    ['color_primary', 'Color primary'],
    ['content-max-width', 'Content max width'],
    ['density', 'Density'],
    ['', ''],
  ])('%s -> %s', (name, expected) => {
    expect(humanizeOptionName(name)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'

import {
  createWidgetCatalogue,
  invalidWidgetFields,
  humaniseKey,
  parseWidgetAttrs,
  summariseWidgetAttrs,
  unmappedAttrs,
  widgetAttrsJson,
  widgetForm,
  widgetFormValues,
} from './htmlWidget'
import { isEmpty } from './values'

/*
 * The real schema of the only widget registered today, copied verbatim from
 * `LastUpdatePageWidget.Attributes.model_json_schema()`. If the mapping ever
 * stops handling this one, the feature is broken in production.
 */
const LAST_PAGE_SCHEMA = {
  additionalProperties: false,
  properties: {
    heading: {
      default: '',
      description: 'Optional heading above the list.',
      maxLength: 256,
      title: 'Heading',
      type: 'string',
    },
    limit: {
      default: 5,
      description: 'How many pages to list, at most.',
      maximum: 10,
      minimum: 1,
      title: 'Limit',
      type: 'integer',
    },
  },
  title: 'Attributes',
  type: 'object',
}

describe('widgetForm', () => {
  it('maps the schema of the widget that actually exists', () => {
    const { fields, unsupported } = widgetForm(LAST_PAGE_SCHEMA)
    expect(unsupported).toEqual([])
    expect(fields).toEqual([
      {
        name: 'heading',
        widget: 'string',
        label: 'Heading',
        help: 'Optional heading above the list.',
        required: false,
        default: '',
        options: { maxLength: 256 },
      },
      {
        name: 'limit',
        widget: 'integer',
        label: 'Limit',
        help: 'How many pages to list, at most.',
        required: false,
        default: 5,
        options: { min: 1, max: 10 },
      },
    ])
  })

  it('keeps the schema property order', () => {
    const form = widgetForm({
      properties: { zulu: { type: 'string' }, alpha: { type: 'string' } },
    })
    expect(form.fields.map((f) => f.name)).toEqual(['zulu', 'alpha'])
  })

  it.each([
    ['string', 'string'],
    ['integer', 'integer'],
    ['number', 'float'],
    ['boolean', 'boolean'],
  ])('maps a %s property to the %s widget', (type, widget) => {
    const form = widgetForm({ properties: { p: { type } } })
    expect(form.fields[0].widget).toBe(widget)
  })

  it('honours the required list', () => {
    const form = widgetForm({
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      required: ['a'],
    })
    expect(form.fields.map((f) => [f.name, f.required])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('falls back to a humanised key when a property has no title', () => {
    const form = widgetForm({ properties: { date_published: { type: 'string' } } })
    expect(form.fields[0].label).toBe('Date published')
  })

  // pydantic writes `gt`/`lt` as exclusive bounds, and there is no exclusive
  // bound on IntegerField -- so a whole number tightens by one.
  it('turns an exclusive integer bound into an inclusive one', () => {
    const form = widgetForm({
      properties: { p: { type: 'integer', exclusiveMinimum: 0, exclusiveMaximum: 10 } },
    })
    expect(form.fields[0].options).toEqual({ min: 1, max: 9 })
  })

  // A float cannot express it, so it is dropped rather than tightened into a
  // bound the schema never stated. The backend still enforces the real one.
  it('drops an exclusive bound on a float', () => {
    const form = widgetForm({ properties: { p: { type: 'number', exclusiveMinimum: 0 } } })
    expect(form.fields[0].options).toEqual({})
  })

  it('prefers an inclusive bound when both are present', () => {
    const form = widgetForm({
      properties: { p: { type: 'integer', minimum: 2, exclusiveMinimum: 0 } },
    })
    expect(form.fields[0].options.min).toBe(2)
  })

  /*
   * The case that would otherwise be silently dropped: pydantic emits an enum
   * as a named definition and leaves a bare `$ref` on the property, so nothing
   * on the property itself says "enum".
   */
  it('follows a $ref into $defs to find an enum', () => {
    const form = widgetForm({
      $defs: { Layout: { enum: ['grid', 'list'], title: 'Layout', type: 'string' } },
      properties: { layout: { $ref: '#/$defs/Layout' } },
    })
    expect(form.unsupported).toEqual([])
    expect(form.fields[0].widget).toBe('selection')
    expect(form.fields[0].label).toBe('Layout')
    expect(form.fields[0].options.choices).toEqual([
      { value: 'grid', label: 'Grid' },
      { value: 'list', label: 'List' },
    ])
  })

  it('reads an inline enum too', () => {
    const form = widgetForm({ properties: { p: { enum: ['a', 'b'] } } })
    expect(form.fields[0].widget).toBe('selection')
  })

  it('keeps the property title over the referenced definition title', () => {
    const form = widgetForm({
      $defs: { Layout: { enum: ['grid'], title: 'Layout' } },
      properties: { layout: { $ref: '#/$defs/Layout', title: 'How to lay it out' } },
    })
    expect(form.fields[0].label).toBe('How to lay it out')
  })

  // Optional[int] -> anyOf [integer, null]. One real branch, so it is
  // indirection and not a union.
  it('unwraps an optional', () => {
    const form = widgetForm({
      properties: { p: { anyOf: [{ type: 'integer' }, { type: 'null' }], default: null } },
      required: ['p'],
    })
    expect(form.unsupported).toEqual([])
    expect(form.fields[0].widget).toBe('integer')
    // Nullable overrides the required list: the schema itself accepts null.
    expect(form.fields[0].required).toBe(false)
    expect(form.fields[0].default).toBeNull()
  })

  it('unwraps a single-entry allOf', () => {
    const form = widgetForm({
      properties: { p: { allOf: [{ type: 'integer', minimum: 3 }], title: 'P' } },
    })
    expect(form.fields[0].widget).toBe('integer')
    expect(form.fields[0].options.min).toBe(3)
  })

  it('unwraps an optional enum reached through a $ref', () => {
    const form = widgetForm({
      $defs: { Mode: { enum: ['a', 'b'] } },
      properties: { mode: { anyOf: [{ $ref: '#/$defs/Mode' }, { type: 'null' }] } },
    })
    expect(form.fields[0].widget).toBe('selection')
  })

  /*
   * Reported, never guessed at. Rendering an array as a text box would let an
   * author save something the widget's own attribute_schema then refuses, and
   * the 422 comes back pointing at `content` rather than at the parameter.
   */
  it.each([
    ['an array', { type: 'array', items: { type: 'string' } }],
    ['a nested object', { type: 'object' }],
    ['a union of two real types', { anyOf: [{ type: 'string' }, { type: 'integer' }] }],
    ['a property with no type at all', { description: 'mystery' }],
  ])('reports %s as unsupported', (_label, property) => {
    const form = widgetForm({ properties: { p: property } })
    expect(form.fields).toEqual([])
    expect(form.unsupported).toEqual(['p'])
  })

  it('keeps the supported half of a schema that has both', () => {
    const form = widgetForm({
      properties: { good: { type: 'string' }, bad: { type: 'array' } },
    })
    expect(form.fields.map((f) => f.name)).toEqual(['good'])
    expect(form.unsupported).toEqual(['bad'])
  })

  it.each([
    ['a widget with no parameters', { properties: {}, type: 'object' }],
    ['null', null],
    ['a number', 3],
    ['a schema with no properties key', { type: 'object' }],
  ])('answers an empty form for %s', (_label, schema) => {
    expect(widgetForm(schema)).toEqual({ fields: [], unsupported: [] })
  })

  it('does not loop on a self-referential $ref', () => {
    const form = widgetForm({
      $defs: { Loop: { $ref: '#/$defs/Loop' } },
      properties: { p: { $ref: '#/$defs/Loop' } },
    })
    expect(form.unsupported).toEqual(['p'])
  })
})

/*
 * The second widget the backend registers, again copied verbatim from
 * `SideMenuWidget.Attributes.model_json_schema()`. It brings two shapes the
 * first one does not: a REQUIRED string, and a `pattern`.
 */
const SIDE_MENU_SCHEMA = {
  additionalProperties: false,
  properties: {
    menu_id: {
      description: 'Identifier of the root menu item, whose descendants are listed.',
      maxLength: 32,
      title: 'Menu Id',
      type: 'string',
    },
    heading: {
      default: '',
      description: "Optional heading, overriding the root menu item's name.",
      maxLength: 256,
      title: 'Heading',
      type: 'string',
    },
    css_class: {
      default: '',
      description: 'Optional CSS classes added to every item of the list.',
      maxLength: 128,
      pattern: '^[A-Za-z0-9_\\- ]*$',
      title: 'Css Class',
      type: 'string',
    },
  },
  required: ['menu_id'],
  title: 'Attributes',
  type: 'object',
}

describe('widgetForm on the side-menu schema', () => {
  const { fields, unsupported } = widgetForm(SIDE_MENU_SCHEMA)

  it('maps all three properties', () => {
    expect(unsupported).toEqual([])
    expect(fields.map((f) => [f.name, f.widget, f.required])).toEqual([
      ['menu_id', 'string', true],
      ['heading', 'string', false],
      ['css_class', 'string', false],
    ])
  })

  it('carries the pattern on the field, not into FieldOptions', () => {
    const cssClass = fields.find((f) => f.name === 'css_class')
    expect(cssClass?.pattern).toBe('^[A-Za-z0-9_\\- ]*$')
    // CharField has no pattern support, and giving it one would widen a
    // contract every screen shares.
    expect(cssClass?.options).toEqual({ maxLength: 128 })
  })

  it('reads "Menu Id" as the label pydantic generated', () => {
    expect(fields[0].label).toBe('Menu Id')
  })
})

describe('invalidWidgetFields', () => {
  const { fields } = widgetForm(SIDE_MENU_SCHEMA)
  const values = (cssClass: string) => ({ menu_id: 'm', heading: '', css_class: cssClass })

  it('accepts what the pattern allows', () => {
    expect(invalidWidgetFields(values('nav nav-side_1'), fields)).toEqual([])
  })

  it('names the field whose value the pattern refuses', () => {
    // Refused server-side too, but as "Invalid widget parameters" on `content`.
    expect(invalidWidgetFields(values('nav>side'), fields)).toEqual(['css_class'])
    expect(invalidWidgetFields(values('a.b'), fields)).toEqual(['css_class'])
  })

  it('leaves an empty optional alone: absent is not malformed', () => {
    expect(invalidWidgetFields(values(''), fields)).toEqual([])
  })

  it('ignores a field with no pattern at all', () => {
    expect(invalidWidgetFields({ menu_id: 'anything goes >_<' }, fields)).toEqual([])
  })

  /*
   * A regex python accepts and javascript does not is the schema's problem.
   * Refusing to save over it would leave the author no way forward.
   */
  it('ignores a pattern javascript cannot compile', () => {
    const broken = widgetForm({
      properties: { p: { type: 'string', pattern: '(?<=bad' } },
    }).fields
    expect(invalidWidgetFields({ p: 'x' }, broken)).toEqual([])
  })
})

describe('parseWidgetAttrs', () => {
  it('reads the JSON payload of a marker', () => {
    expect(parseWidgetAttrs('{"limit":5}')).toEqual({ limit: 5 })
  })

  it('passes an object straight through', () => {
    expect(parseWidgetAttrs({ limit: 5 })).toEqual({ limit: 5 })
  })

  /*
   * NEVER throws: this is read from an HTML attribute a human may have typed in
   * the source view, and it is read inside a node view, where an exception
   * takes the editor's render down with it.
   */
  it.each([
    ['malformed JSON', '{"limit":'],
    ['a JSON array', '[1,2]'],
    ['a JSON scalar', '42'],
    ['the empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
  ])('degrades %s to no parameters', (_label, raw) => {
    expect(parseWidgetAttrs(raw)).toEqual({})
  })
})

describe('widgetAttrsJson', () => {
  const { fields } = widgetForm(LAST_PAGE_SCHEMA)

  it('writes only what differs from the schema default', () => {
    const json = widgetAttrsJson({ heading: 'Latest', limit: 5 }, fields)
    expect(json).toBe('{"heading":"Latest"}')
  })

  it('leaves the attribute off entirely when nothing differs', () => {
    expect(widgetAttrsJson({ heading: '', limit: 5 }, fields)).toBeNull()
  })

  it('omits an empty optional rather than writing null', () => {
    expect(widgetAttrsJson({ heading: null, limit: 3 }, fields)).toBe('{"limit":3}')
  })

  it('emits in schema order, so an untouched widget re-saves identically', () => {
    const a = widgetAttrsJson({ limit: 3, heading: 'x' }, fields)
    const b = widgetAttrsJson({ heading: 'x', limit: 3 }, fields)
    expect(a).toBe('{"heading":"x","limit":3}')
    expect(a).toBe(b)
  })

  // 0 and false are values, not blanks -- the classic `required` bug, and it
  // would silently drop a parameter here instead.
  it('keeps 0 and false', () => {
    const zeroFields = widgetForm({
      properties: { n: { type: 'integer' }, b: { type: 'boolean' } },
    }).fields
    expect(widgetAttrsJson({ n: 0, b: false }, zeroFields)).toBe('{"n":0,"b":false}')
  })

  it('carries the raw-JSON half through', () => {
    expect(widgetAttrsJson({ heading: 'x', limit: 5 }, fields, { tags: ['a'] })).toBe(
      '{"heading":"x","tags":["a"]}',
    )
  })
})

describe('widgetFormValues', () => {
  const { fields } = widgetForm(LAST_PAGE_SCHEMA)

  it('seeds from the marker, defaults filling the gaps', () => {
    expect(widgetFormValues({ heading: 'Latest' }, fields)).toEqual({
      heading: 'Latest',
      limit: 5,
    })
  })

  it('ignores a value of a shape a FieldValue cannot hold', () => {
    expect(widgetFormValues({ limit: { nope: true } }, fields).limit).toBeNull()
  })

  it('round-trips through widgetAttrsJson', () => {
    const values = widgetFormValues({ heading: 'Latest', limit: 3 }, fields)
    expect(widgetAttrsJson(values, fields)).toBe('{"heading":"Latest","limit":3}')
  })
})

describe('unmappedAttrs', () => {
  const { fields } = widgetForm(LAST_PAGE_SCHEMA)

  it('keeps only the keys no generated field owns', () => {
    expect(unmappedAttrs({ heading: 'x', tags: ['a'] }, fields)).toEqual({ tags: ['a'] })
  })

  it('is empty when the form covers everything', () => {
    expect(unmappedAttrs({ heading: 'x', limit: 2 }, fields)).toEqual({})
  })
})

describe('summariseWidgetAttrs', () => {
  const { fields } = widgetForm(LAST_PAGE_SCHEMA)

  it('reads as "Label: value", in schema order', () => {
    expect(summariseWidgetAttrs({ limit: 5, heading: 'Latest' }, fields)).toBe(
      'Heading: Latest, Limit: 5',
    )
  })

  // The block renders before the catalogue has loaded, and for a widget id the
  // registry does not know at all -- so labels are a bonus, not a requirement.
  it('humanises the keys when it has no fields', () => {
    expect(summariseWidgetAttrs({ page_size: 4 })).toBe('Page size: 4')
  })

  it('shows a boolean as a word', () => {
    expect(summariseWidgetAttrs({ show: true, hide: false })).toBe('Show: Yes, Hide: No')
  })

  it('keeps 0 and the empty string visible', () => {
    expect(summariseWidgetAttrs({ n: 0, s: '' })).toBe('N: 0, S: ')
  })

  it('is empty for no parameters', () => {
    expect(summariseWidgetAttrs({}, fields)).toBe('')
  })

  it('truncates a long value rather than pushing the block wide', () => {
    const summary = summariseWidgetAttrs({ heading: 'x'.repeat(120) }, fields)
    expect(summary.length).toBeLessThan(60)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('appends a key the schema does not declare, after the ones it does', () => {
    expect(summariseWidgetAttrs({ extra: 1, heading: 'h' }, fields)).toBe('Heading: h, Extra: 1')
  })
})

describe('createWidgetCatalogue', () => {
  const TYPES = [{ id: 'last-page', title: 'Last Updated Pages', attribute_schema: {} }]

  it('starts empty, so a node view can render before the fetch resolves', () => {
    expect(createWidgetCatalogue().types()).toEqual([])
  })

  it('notifies its subscribers when the catalogue arrives', () => {
    const catalogue = createWidgetCatalogue()
    let calls = 0
    catalogue.subscribe(() => { calls += 1 })
    catalogue.set(TYPES)
    expect(calls).toBe(1)
    expect(catalogue.types()).toEqual(TYPES)
  })

  it('stops notifying after unsubscribe', () => {
    const catalogue = createWidgetCatalogue()
    let calls = 0
    const stop = catalogue.subscribe(() => { calls += 1 })
    stop()
    catalogue.set(TYPES)
    expect(calls).toBe(0)
  })

  // A node view unsubscribing from inside its own listener would otherwise
  // mutate the set being iterated.
  it('survives a listener that unsubscribes itself', () => {
    const catalogue = createWidgetCatalogue()
    let calls = 0
    const stop = catalogue.subscribe(() => { calls += 1; stop() })
    catalogue.subscribe(() => { calls += 1 })
    expect(() => catalogue.set(TYPES)).not.toThrow()
    expect(calls).toBe(2)
  })

  it('finds a type by id, and answers undefined for anything else', () => {
    const catalogue = createWidgetCatalogue()
    catalogue.set(TYPES)
    expect(catalogue.find('last-page')?.title).toBe('Last Updated Pages')
    expect(catalogue.find('nope')).toBeUndefined()
    expect(catalogue.find(null)).toBeUndefined()
  })
})

describe('humaniseKey', () => {
  it.each([
    ['heading', 'Heading'],
    ['page_size', 'Page size'],
    ['show-all', 'Show all'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(humaniseKey(input)).toBe(expected)
  })
})

/* The predicate the omit-empties rule rests on, asserted rather than assumed. */
describe('the empty rule widgetAttrsJson relies on', () => {
  it('treats 0 and false as filled', () => {
    expect(isEmpty(0)).toBe(false)
    expect(isEmpty(false)).toBe(false)
    expect(isEmpty('')).toBe(true)
    expect(isEmpty(null)).toBe(true)
  })
})

/*
 * JSON Schema -> form fields, for the options a website theme declares.
 *
 * The one piece of this feature that is genuinely treacherous, so it lives here
 * -- Vue-free, with a spec next door -- rather than inside the component, the
 * same split as userRolesSelection.ts.
 *
 * WHERE THE SCHEMA COMES FROM. A theme is code, not a row: it declares its
 * options as a pydantic model and `/website/themes/` publishes that model's
 * `model_json_schema()` as `option_schema`. So the fields of this subform are
 * not known to this app at all -- restating them in javascript is exactly what
 * that endpoint exists to avoid. What arrives looks like:
 *
 *   { "properties": { "color_primary": {
 *       "anyOf": [{ "type": "string", "pattern": "^#..." }, { "type": "null" }],
 *       "default": null, "title": "Primary Colour", "description": "…" } } }
 *
 * The `anyOf [T, null]` wrapper is pydantic's spelling of `Optional[T]`, and
 * every theme option is `Optional` by construction: `ThemeMetaclass` REFUSES at
 * startup a theme declaring an option with no default, so that the read path can
 * always fall back to the schema's own defaults. Two consequences this module
 * relies on:
 *
 *  - no option is ever required. Nothing here parses `required`, and the
 *    subform registers no constraint -- there is none to register.
 *  - an unset option is an ABSENT key, not a null. `withThemeOption` drops the
 *    key rather than storing null, which is what the column's own help text
 *    describes: "the author's explicit overrides only".
 *
 * WHAT IS DELIBERATELY NOT DONE. `pattern` is read but not enforced: a regex is
 * not something to show an author, and the backend refuses a bad value with a
 * message naming the option -- which splitThemeOptionErrors puts back under the
 * right field. Nested objects and arrays are not mapped either; they are
 * reported by name instead of being silently dropped, so an author can see that
 * an option exists and is not editable here.
 */

import type { ChoiceInput, FieldOptions, FieldValue, Widget } from '../fields/types'

/** The values of a theme's options: a flat bag, keyed by option name. */
export type ThemeOptionValues = Record<string, FieldValue>

/**
 * The selected theme, as the catalogue returns it.
 *
 * Declared here and not in the component, which cannot export a type from its
 * `<script setup>`; structurally typed rather than imported from
 * `resources/websiteThemes`, because a component must not depend on a resource
 * module. `option_schema` stays `unknown` on purpose -- its shape is the
 * theme's own business, and readThemeOptionSchema is total over it.
 */
export interface ThemeOptionSource {
  id: string
  title?: string
  option_schema?: unknown
}

/** One option, ready to hand to a <Field>. */
export interface ThemeOptionField {
  name: string
  widget: Widget
  label: string
  help?: string
  options: FieldOptions
}

export interface ThemeOptionForm {
  /** In DECLARATION order: `properties` preserves the theme author's own. */
  fields: ThemeOptionField[]
  /**
   * Options whose schema this cannot turn into a field -- an object, an array,
   * a union of two real types. Named rather than dropped: an author must be
   * able to see that the theme has an option the admin cannot edit.
   */
  unsupported: string[]
}

type Node = Record<string, unknown>

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `#/$defs/Name` -> the definition, when it is one this document carries. */
function resolveRef(ref: unknown, defs: Node): Node | null {
  if (typeof ref !== 'string') return null
  const prefix = '#/$defs/'
  if (!ref.startsWith(prefix)) return null
  const target = defs[ref.slice(prefix.length)]
  return isNode(target) ? target : null
}

/**
 * The node that actually describes the value, past pydantic's wrappers.
 *
 * `Optional[T]` is `anyOf: [T, {type: null}]`, an enum is a `$ref` into
 * `$defs`, and a `$ref` with siblings is wrapped in a single-entry `allOf`.
 * Unwrapping is bounded: a union of two REAL types stays unresolved, on
 * purpose -- one control cannot honestly edit `str | int`.
 */
function unwrap(node: Node, defs: Node, depth = 0): Node | null {
  if (depth > 4) return null

  const ref = resolveRef(node.$ref, defs)
  if (ref) return unwrap({ ...ref, ...omitRef(node) }, defs, depth + 1)

  const union = node.anyOf ?? node.oneOf ?? node.allOf
  if (Array.isArray(union)) {
    // `{type: "null"}` is the Optional marker, never a type to render.
    const real = union.filter((entry) => isNode(entry) && entry.type !== 'null')
    if (real.length !== 1) return null
    return unwrap({ ...(real[0] as Node), ...omitUnion(node) }, defs, depth + 1)
  }

  return node
}

/** The wrapper's own keys -- `title`, `description`, `default` -- keep priority
    over the ones the referenced definition carries. */
function omitRef(node: Node): Node {
  const { $ref: _ref, ...rest } = node
  return rest
}

function omitUnion(node: Node): Node {
  const { anyOf: _any, oneOf: _one, allOf: _all, ...rest } = node
  return rest
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** `color_primary` -> `Color primary`. Only ever a fallback: pydantic sends a
    `title` for every field, derived from the name when the author gave none. */
export function humanizeOptionName(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim()
  if (!words) return name
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** An enum, when every member is usable as a dropdown value. */
function choicesOf(node: Node): ChoiceInput[] | null {
  const values = node.enum ?? node.const
  const list = Array.isArray(values) ? values : values === undefined ? null : [values]
  if (!list || !list.length) return null
  if (!list.every((entry) => typeof entry === 'string' || typeof entry === 'number')) return null
  return list as ChoiceInput[]
}

/** The widget for one resolved node, or null when nothing here fits. */
function widgetFor(node: Node): { widget: Widget; options: FieldOptions } | null {
  const choices = choicesOf(node)
  if (choices) return { widget: 'selection', options: { choices } }

  switch (node.type) {
    case 'string': {
      // `format` is pydantic's spelling of a date / an instant. Mapped because
      // the two widgets exist and both speak ISO, which is what lands in JSON.
      if (node.format === 'date') return { widget: 'date', options: {} }
      if (node.format === 'date-time') return { widget: 'datetime', options: {} }
      const options: FieldOptions = {}
      const maxLength = num(node.maxLength)
      if (maxLength !== undefined) options.maxLength = maxLength
      return { widget: 'string', options }
    }
    case 'integer':
    case 'number': {
      const options: FieldOptions = {}
      const min = num(node.minimum) ?? num(node.exclusiveMinimum)
      const max = num(node.maximum) ?? num(node.exclusiveMaximum)
      if (min !== undefined) options.min = min
      if (max !== undefined) options.max = max
      return { widget: node.type === 'integer' ? 'integer' : 'float', options }
    }
    case 'boolean':
      return { widget: 'boolean', options: {} }
    default:
      return null
  }
}

/**
 * The form a theme's `option_schema` describes.
 *
 * Total: anything unrecognisable -- a missing schema, a broken one, an option
 * of a shape no widget covers -- comes back as an empty list or a name in
 * `unsupported`, never as a throw. This runs on a payload the backend built
 * from a theme's own code, so a shape this app has never seen is an ordinary
 * outcome of deploying a new theme, not a bug to crash on.
 */
export function readThemeOptionSchema(schema: unknown): ThemeOptionForm {
  const fields: ThemeOptionField[] = []
  const unsupported: string[] = []

  if (!isNode(schema)) return { fields, unsupported }

  const properties = schema.properties
  if (!isNode(properties)) return { fields, unsupported }

  const defs = isNode(schema.$defs) ? schema.$defs : {}

  for (const [name, raw] of Object.entries(properties)) {
    if (!isNode(raw)) {
      unsupported.push(name)
      continue
    }

    const node = unwrap(raw, defs)
    const mapped = node ? widgetFor(node) : null
    if (!node || !mapped) {
      unsupported.push(name)
      continue
    }

    fields.push({
      name,
      widget: mapped.widget,
      label: str(node.title) ?? str(raw.title) ?? humanizeOptionName(name),
      help: str(node.description) ?? str(raw.description),
      options: mapped.options,
    })
  }

  return { fields, unsupported }
}

/**
 * The stored blob, narrowed to what the CURRENT schema declares.
 *
 * Two things at once, and both are load-bearing:
 *
 *  - keys the schema no longer declares are DROPPED. The backend's read path
 *    drops them too (`resolve_options`), but its write path does not: the
 *    options model is `extra="forbid"`, so echoing a stale key back is a 422.
 *  - a value of the wrong javascript type is dropped rather than shown. It
 *    would not survive its widget anyway, and a control silently coercing it
 *    would send an edit the author never made.
 */
export function themeOptionValues(
  raw: unknown,
  fields: readonly ThemeOptionField[],
): ThemeOptionValues {
  const values: ThemeOptionValues = {}
  if (!isNode(raw)) return values

  for (const field of fields) {
    const value = raw[field.name]
    if (value === null || value === undefined) continue

    const fits =
      field.widget === 'boolean'
        ? typeof value === 'boolean'
        : field.widget === 'integer' || field.widget === 'float'
          ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === 'string' || typeof value === 'number'

    if (fits) values[field.name] = value as FieldValue
  }
  return values
}

/**
 * One option changed, as a NEW object.
 *
 * An empty value REMOVES the key instead of storing null: the column holds the
 * author's explicit overrides only, and `css_variables` drops a null anyway --
 * so an absent key and a null mean the same thing to the backend, and only one
 * of the two spellings survives a round trip unchanged.
 *
 * Never mutates: the caller compares this against its baseline to know whether
 * anything was edited, and an in-place write would edit that baseline too.
 */
export function withThemeOption(
  values: ThemeOptionValues,
  name: string,
  value: FieldValue,
): ThemeOptionValues {
  const next = { ...values }
  const empty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && !value.length)

  if (empty) delete next[name]
  else next[name] = value
  return next
}

/** How many options carry an explicit value. Shown on the folded panel, so it
    says whether there is anything inside. */
export function countThemeOptions(values: unknown): number {
  if (!isNode(values)) return 0
  return Object.values(values).filter((value) => value !== null && value !== undefined).length
}

/**
 * Do these two bags describe the same overrides?
 *
 * Key order is not data -- the blob comes back from postgres `jsonb`, whose
 * order is its own -- so this compares as sets of pairs, the same instinct as
 * `sameFieldValue` comparing lists as sets. Null and absent are equal, for the
 * reason `withThemeOption` gives.
 */
export function sameThemeOptions(left: unknown, right: unknown): boolean {
  const a = isNode(left) ? left : {}
  const b = isNode(right) ? right : {}

  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const one = a[key] ?? null
    const two = b[key] ?? null
    if (one === null && two === null) continue
    if (one !== two) return false
  }
  return true
}

export interface ThemeOptionErrors {
  /** Per option, ready for the subform's own form context. */
  fields: Record<string, string>
  /** What could not be attributed to one. Shown as the panel's banner. */
  rest: string
}

/**
 * The backend's `theme_options` message, split back into per-option messages.
 *
 * `WebsiteService.validate_data` reports pydantic's errors as
 * `"<option>: <message>"` strings, and `parseApiError` joins everything that
 * shared a `loc` into ONE string -- so what arrives here is
 * `"color_primary: String should match … content_max_width: String should …"`.
 * Without this, a folded panel would show one unreadable blob for a refusal
 * that names its field perfectly well.
 *
 * The split anchors on ANY `<identifier>: ` at a word boundary, not only on the
 * names this schema declares -- which is the whole difference between a message
 * landing in `rest` and one landing under the wrong field. `theme_options`
 * errors routinely name something this form has no field for: an extra key left
 * by another client (`nope: Extra inputs are not permitted`), or a nested
 * `loc`. Anchoring only on known names would silently glue that text onto
 * whichever option happened to come before it.
 *
 * Its remaining failure mode is narrow and accepted: a refusal whose own text
 * contained `something: ` would be cut there. None of pydantic's do -- they
 * read "Input should be a valid string", "Extra inputs are not permitted",
 * "String should match pattern '…'" -- and the cost would be a sentence split
 * in two, never a message lost.
 */
export function splitThemeOptionErrors(
  message: string | undefined | null,
  names: readonly string[],
): ThemeOptionErrors {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return { fields: {}, rest: '' }

  // `(^|\s)` so `color_primary:` does not match inside `x_color_primary:`, and
  // a dotted name so a nested `loc` anchors as one piece.
  const anchor = /(^|\s)([A-Za-z_][A-Za-z0-9_.]*):\s+/g
  const known = new Set(names)

  const fields: Record<string, string> = {}
  const unattributed: string[] = []

  let cursor = 0
  let current: string | null = null

  function push(upTo: number): void {
    const slice = text.slice(cursor, upTo).trim()
    if (!slice) return
    if (current && known.has(current)) {
      // Two refusals on one option are joined rather than one hiding the other.
      fields[current] = fields[current] ? `${fields[current]} ${slice}` : slice
    } else {
      // Anything this form has no field for stays whole -- name included, since
      // that name is the only thing saying what was refused.
      unattributed.push(current ? `${current}: ${slice}` : slice)
    }
  }

  for (let match = anchor.exec(text); match; match = anchor.exec(text)) {
    push(match.index + match[1].length)
    current = match[2] ?? null
    cursor = match.index + match[0].length
  }
  push(text.length)

  return { fields, rest: unattributed.join(' ') }
}

/*
 * The widget-marker logic of HtmlField, with no dependency on Vue and none on
 * TipTap -- so it is reachable from a spec in the `node` environment, where the
 * extension list and the node view are not.
 *
 * Two jobs, and both are the kind that fails silently:
 *
 *  - turning a widget's `attribute_schema` into a list of fields to render.
 *    That schema is whatever pydantic's `model_json_schema()` produced, so it
 *    arrives with `$ref`/`$defs` indirection for enums, `anyOf` for optionals
 *    and constraint keys this app has to map onto FieldOptions. Get it wrong
 *    and the form quietly omits a parameter, or offers a text box for a number.
 *  - reading and writing the `attrs` payload, which travels as a JSON string
 *    inside an HTML attribute. A malformed one must degrade to "no parameters",
 *    never throw inside a node view.
 */

import type { HtmlWidgetType } from './html'
import type { ChoiceInput, FieldOptions, FieldValue } from './types'
import { isEmpty } from './values'

/** The widgets a generated form can render -- a subset of the registry. */
export type WidgetFormWidget = 'string' | 'integer' | 'float' | 'boolean' | 'selection'

/** One row of the generated form. */
export interface WidgetFormField {
  /** The JSON Schema property name, which is also the `attrs` key. */
  name: string
  widget: WidgetFormWidget
  label: string
  help?: string
  required: boolean
  /** The schema's own default, coerced to a FieldValue. */
  default: FieldValue
  /** Reuses the existing field options: maxLength, min, max, choices. */
  options: FieldOptions
  /**
   * A `pattern` constraint from the schema, as a source string.
   *
   * Kept on the FIELD rather than pushed into FieldOptions, deliberately:
   * CharField has no pattern support and giving it one would widen a contract
   * every screen shares, for a rule only this dialog enforces. So the dialog
   * validates it and the shared widget stays untouched.
   */
  pattern?: string
}

export interface WidgetForm {
  fields: WidgetFormField[]
  /**
   * Properties the mapping cannot express -- an array, a nested object, a union
   * of two real types.
   *
   * Named rather than dropped: a silently missing parameter is how a widget
   * renders wrong with nothing to explain it. The dialog shows these in a
   * warning and hands over a raw-JSON box for them, so the widget stays
   * editable by someone who knows what it wants.
   */
  unsupported: string[]
}

/** `"date_published"` -> `"Date published"`, for a property with no `title`. */
export function humaniseKey(key: string): string {
  const words = String(key).replace(/[_-]+/g, ' ').trim()
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Follows a `$ref` into `$defs`.
 *
 * pydantic emits an enum as a named definition and points at it, so the
 * property itself carries no `enum` key at all -- without this, every enum
 * parameter would land in `unsupported`.
 *
 * Only local `#/$defs/...` refs are followed: there is nothing else to resolve
 * against, and a remote one is a schema this app cannot honour anyway.
 */
function resolveRef(node: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> {
  const ref = node.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return node
  const defs = root.$defs
  if (!isRecord(defs)) return node
  const target = defs[ref.slice('#/$defs/'.length)]
  return isRecord(target) ? { ...target, ...omit(node, '$ref') } : node
}

function omit(node: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...node }
  delete copy[key]
  return copy
}

interface Resolved {
  node: Record<string, unknown>
  /** True when the schema said the value may be null. */
  nullable: boolean
}

/**
 * Reduces a property schema to the one shape that matters, plus nullability.
 *
 * `Optional[int]` becomes `anyOf: [{type: integer}, {type: null}]` and a
 * constrained field can arrive wrapped in a single-entry `allOf`. Both are
 * indirection around one real type; a union of two REAL types is not, and is
 * left alone so the caller reports it as unsupported.
 */
function resolveProperty(raw: unknown, root: Record<string, unknown>): Resolved {
  let node = isRecord(raw) ? resolveRef(raw, root) : {}
  let nullable = false

  for (let depth = 0; depth < 4; depth += 1) {
    const union = node.anyOf ?? node.oneOf
    const all = node.allOf

    if (Array.isArray(all) && all.length === 1) {
      node = { ...resolveProperty(all[0], root).node, ...omit(node, 'allOf') }
      continue
    }

    if (Array.isArray(union)) {
      const real = union.filter((entry) => !(isRecord(entry) && entry.type === 'null'))
      if (real.length !== union.length) nullable = true
      // Two real branches is a genuine union: not indirection, and not
      // something one control can express.
      if (real.length !== 1) break
      node = { ...resolveProperty(real[0], root).node, ...omit(omit(node, 'anyOf'), 'oneOf') }
      continue
    }

    break
  }

  if (node.type === 'null') nullable = true
  return { node, nullable }
}

/** A schema `default` narrowed to what a FieldValue can hold. */
function defaultValue(raw: unknown): FieldValue {
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  return null
}

/**
 * The lower bound as an INTEGER field expresses it.
 *
 * `gt=0` arrives as `exclusiveMinimum: 0`, which for whole numbers means 1.
 * There is no exclusive bound on IntegerField/FloatField, so a float's
 * exclusive bound is dropped rather than tightened into a lie -- the backend
 * still enforces it, and this form is a convenience over that.
 */
function numericBounds(node: Record<string, unknown>, whole: boolean): FieldOptions {
  const options: FieldOptions = {}
  const min = node.minimum
  const max = node.maximum
  const exclusiveMin = node.exclusiveMinimum
  const exclusiveMax = node.exclusiveMaximum

  if (typeof min === 'number') options.min = min
  else if (typeof exclusiveMin === 'number' && whole) options.min = exclusiveMin + 1

  if (typeof max === 'number') options.max = max
  else if (typeof exclusiveMax === 'number' && whole) options.max = exclusiveMax - 1

  return options
}

/** An `enum` list turned into SelectionField choices. */
function choicesFrom(values: unknown[]): ChoiceInput[] {
  return values
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map((value) => ({ value, label: humaniseKey(String(value)) }))
}

/**
 * A widget's `attribute_schema` -> the fields to render for it.
 *
 * Anything unrecognised is reported in `unsupported` rather than guessed at:
 * rendering an array as a text box would let an author save something the
 * backend's own `attribute_schema` then rejects, and the 422 would point at
 * `content` rather than at the parameter.
 */
export function widgetForm(schema: unknown): WidgetForm {
  const root = isRecord(schema) ? schema : {}
  const properties = isRecord(root.properties) ? root.properties : {}
  const requiredList = Array.isArray(root.required) ? root.required.map(String) : []

  const fields: WidgetFormField[] = []
  const unsupported: string[] = []

  for (const [name, raw] of Object.entries(properties)) {
    const { node, nullable } = resolveProperty(raw, root)
    const label = typeof node.title === 'string' && node.title !== '' ? node.title : humaniseKey(name)
    const help = typeof node.description === 'string' && node.description !== '' ? node.description : undefined
    // `nullable` overrides the required list: a parameter that accepts null is
    // not one the form may insist on.
    const required = requiredList.includes(name) && !nullable
    const base = { name, label, help, required, default: defaultValue(node.default) }

    if (Array.isArray(node.enum) && node.enum.length > 0) {
      const choices = choicesFrom(node.enum)
      if (choices.length === 0) {
        unsupported.push(name)
        continue
      }
      fields.push({ ...base, widget: 'selection', options: { choices } })
      continue
    }

    switch (node.type) {
      case 'string': {
        const options: FieldOptions = {}
        if (typeof node.maxLength === 'number') options.maxLength = node.maxLength
        // `pattern` is checked in the dialog, before the marker is written: the
        // backend refuses a bad one too, but as "Invalid widget parameters" on
        // `content`, which points at the page body rather than at the field the
        // author got wrong.
        const pattern = typeof node.pattern === 'string' ? node.pattern : undefined
        fields.push({ ...base, widget: 'string', options, pattern })
        break
      }
      case 'integer':
        fields.push({ ...base, widget: 'integer', options: numericBounds(node, true) })
        break
      case 'number':
        fields.push({ ...base, widget: 'float', options: numericBounds(node, false) })
        break
      case 'boolean':
        fields.push({ ...base, widget: 'boolean', options: {} })
        break
      default:
        unsupported.push(name)
    }
  }

  return { fields, unsupported }
}

/**
 * The marker's `attrs` payload as an object.
 *
 * Never throws: this is read from an HTML attribute that a human may have typed
 * in the source view, and it is read from inside a node view, where an
 * exception would take the editor's render down with it. Anything unparseable
 * degrades to "no parameters", which is what the block then displays.
 */
export function parseWidgetAttrs(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The `attrs` attribute to write, or null to leave it off entirely.
 *
 * A value equal to the field's own default is OMITTED, and that is a decision
 * rather than an economy: the backend re-applies its defaults through
 * `attribute_schema`, so writing them would freeze today's value into every
 * marker and a later change to the widget would not reach the pages already
 * authored. An empty optional is omitted for the same reason.
 *
 * Emitted in the schema's property order, so re-saving an untouched widget
 * produces a byte-identical marker and the form does not read as dirty.
 */
export function widgetAttrsJson(
  values: Record<string, FieldValue>,
  fields: readonly WidgetFormField[],
  extra: Record<string, unknown> = {},
): string | null {
  const payload: Record<string, unknown> = {}

  for (const field of fields) {
    const value = values[field.name]
    if (isEmpty(value)) continue
    if (value === field.default) continue
    payload[field.name] = value
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) payload[key] = value
  }

  return Object.keys(payload).length === 0 ? null : JSON.stringify(payload)
}

/**
 * Which fields hold a value their schema refuses.
 *
 * Only `pattern` for now, because it is the only constraint the generated
 * controls cannot express themselves -- maxLength, min and max are enforced by
 * the inputs.
 *
 * An unparseable pattern is IGNORED rather than treated as a failure: a regex
 * python accepts and javascript does not is the schema's problem, and refusing
 * to save over it would leave the author with no way forward at all.
 */
export function invalidWidgetFields(
  values: Record<string, FieldValue>,
  fields: readonly WidgetFormField[],
): string[] {
  return fields
    .filter((field) => {
      if (!field.pattern) return false
      const value = values[field.name]
      if (typeof value !== 'string' || value === '') return false
      try {
        return !new RegExp(field.pattern).test(value)
      } catch {
        return false
      }
    })
    .map((field) => field.name)
}

/** How a single parameter value reads on the block. */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

/** Longest a single value is shown as before it is cut. */
const SUMMARY_VALUE_MAX = 40

/**
 * `"Heading: Latest news, Limit: 5"` -- what the block shows under its title.
 *
 * `fields` is optional and only supplies the labels: the block has to render
 * before the catalogue has loaded, and on a widget whose id is not in the
 * registry at all, so the key's humanised form is the fallback rather than a
 * reason to show nothing.
 */
export function summariseWidgetAttrs(
  attrs: Record<string, unknown>,
  fields: readonly WidgetFormField[] = [],
): string {
  const labels = new Map(fields.map((field) => [field.name, field.label]))
  const order = fields.length > 0 ? fields.map((field) => field.name) : []
  const keys = [...order.filter((key) => key in attrs), ...Object.keys(attrs).filter((key) => !order.includes(key))]

  return keys
    .map((key) => {
      const shown = displayValue(attrs[key])
      const cut = shown.length > SUMMARY_VALUE_MAX ? `${shown.slice(0, SUMMARY_VALUE_MAX)}…` : shown
      return `${labels.get(key) ?? humaniseKey(key)}: ${cut}`
    })
    .join(', ')
}

/** The keys of `attrs` that no generated field owns -- the raw-JSON half. */
export function unmappedAttrs(
  attrs: Record<string, unknown>,
  fields: readonly WidgetFormField[],
): Record<string, unknown> {
  const owned = new Set(fields.map((field) => field.name))
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => !owned.has(key)))
}

/** Seeds the generated form from an existing marker, defaults filling the gaps. */
export function widgetFormValues(
  attrs: Record<string, unknown>,
  fields: readonly WidgetFormField[],
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {}
  for (const field of fields) {
    const raw = attrs[field.name]
    values[field.name] = raw === undefined ? field.default : defaultValue(raw)
  }
  return values
}

/**
 * The shared, mutable view of the widget catalogue.
 *
 * It exists because two things need the same list and neither can wait for the
 * other: the dialog, which is Vue and can simply be reactive, and the node
 * views inside ProseMirror, which are imperative DOM built once and told
 * nothing afterwards. A block therefore renders its widget's ID first and its
 * TITLE a moment later, when the fetch resolves -- so the node views subscribe,
 * and this is what they subscribe to.
 *
 * Deliberately not a Vue ref: htmlExtensions.ts must stay importable from a
 * spec, and the node view is not in a component's reactive scope anyway.
 */
export interface WidgetCatalogue {
  types(): readonly HtmlWidgetType[]
  set(types: readonly HtmlWidgetType[]): void
  find(id: unknown): HtmlWidgetType | undefined
  /** Returns the unsubscribe, which a node view calls from `destroy`. */
  subscribe(listener: () => void): () => void
}

export function createWidgetCatalogue(): WidgetCatalogue {
  let types: readonly HtmlWidgetType[] = []
  const listeners = new Set<() => void>()

  return {
    types: () => types,
    set(next) {
      types = next
      // A copy, because a listener that unsubscribes itself would otherwise
      // mutate the set being iterated.
      for (const listener of [...listeners]) listener()
    },
    find(id) {
      return typeof id === 'string' ? types.find((type) => type.id === id) : undefined
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/*
 * The filter model behind useFilter and <MultiRecordFilters>, with no
 * dependency on Vue.
 *
 * A filter exists in three places at once, and this module is the only one
 * that converts between them:
 *
 *   the URL       ?is_active=true    -- strings, and nothing but strings
 *   the query     { is_active: true } -- what useResourceList sends to the API
 *   the form      { is_active: true } -- a FieldValue, what a widget binds to
 *
 * The last two are deliberately the SAME shape: for the widget types a filter
 * is allowed to use, the value the form holds is already the value the wire
 * wants. That is what FilterType is a restricted subset of Widget for, and it
 * is why one `parseFilterValue` serves both directions.
 *
 * A MULTI-VALUED filter (`widget: 'many2many_tags'`) is the one place the
 * shapes part: the form and the query hold a list of strings, the URL and a
 * list request the same items joined with commas (`?category=a,b,null`), a
 * group-by body the list itself -- see api/list.ts and api/groupBy.ts. It
 * mirrors the backend's `MultiValue` filter fields (core/api/filters.py), and
 * its `null` token: NULL_FILTER_VALUE.
 *
 * The first one is where it gets treacherous, and why this is a module of its
 * own with a spec next to it: everything arriving from a URL is a string, so a
 * boolean filter restored from a shared link binds "false" -- a NON-EMPTY
 * string -- to a <BooleanField>, which reads it as Yes and shows the opposite
 * of what the list is doing.
 *
 * INVARIANT, and the reason nothing here trusts its input's type: a filter
 * value may legitimately arrive typed (it came from the form) or as a raw
 * string (it came from the URL, or from useResourceList's own incoming-query
 * watcher, which restores every filter as a string). Both shapes are accepted
 * everywhere, and normalised on the way through.
 */

import { readListQuery, type ListFilters, type QueryLike } from '@/api/list'
import type { FormData } from '@/components/form/context'
import { displayRelation, type RelationRecord } from '@/components/form/fields/many2one'
import type {
  FieldOptions,
  FieldValue,
  SelectionChoice,
  Widget,
} from '@/components/form/fields/types'
import { isEmpty, normaliseChoices, toNumberOrNull } from '@/components/form/fields/values'

/**
 * The widgets a filter may use.
 *
 * An `Extract` of `Widget` rather than a list of its own: renaming a widget
 * then breaks here, at compile time, instead of rendering an error <Message>
 * inside the dialog. What is left out is left out for a reason -- `text`,
 * `html` and `color` are controls nobody filters a list with, and
 * `many2many_tags` is not a TYPE of value: a multi-valued filter is a list of
 * one of these, picked through `FilterField.widget`.
 */
export type FilterType = Extract<
  Widget,
  'string' | 'boolean' | 'integer' | 'float' | 'selection' | 'date' | 'datetime' | 'many2one'
>

/**
 * The token for "empty" in a multi-valued filter: `?category=a,null` keeps the
 * movements of category `a` AND the uncategorized ones. The backend's
 * `NULL_SENTINEL`, verbatim.
 *
 * A string, in the state as on the wire, rather than `null`: `null` already
 * means "this filter is unset", and a list widget's value cannot hold it (a
 * FieldValue list is ids). So the widgets see an ordinary id, labelled by the
 * entry `filterWidgetOptions` puts in front of their candidates, and nothing in
 * the form framework learns about it.
 */
export const NULL_FILTER_VALUE = 'null'

/** What the "empty" entry reads as when the declaration names nothing better. */
export const DEFAULT_NULL_LABEL = 'None'

/** One declared filter. The dict's KEY is the query parameter name. */
export interface FilterField {
  /**
   * The type of the value -- of EACH value, for a multi-valued filter. Also the
   * control, unless `widget` names another one.
   */
  type: FilterType
  /**
   * The control, when it is not `type`'s own. `many2many_tags` is the one that
   * changes the value's shape: the filter then holds a LIST of `type` values,
   * for an endpoint whose field is a backend `MultiValue`. Over a many2one, its
   * `fetch` and `resolve` are reused as they are; over a selection, they are
   * built from the choices (see filterWidgetOptions).
   */
  widget?: Widget
  label: string
  /**
   * The explanatory line under the control.
   *
   * snake_case, alone among this codebase's own types, because it describes a
   * query parameter of the API and reads next to its siblings -- the same
   * reason wire keys are never renamed client-side.
   */
  help_text?: string
  /**
   * Forwarded to the widget: `choices` for a selection, `fetch` and `resolve`
   * for a many2one.
   *
   * A many2one filter cannot carry `record`, unlike one on a form -- there is
   * no fetched row behind a filter, only the id a URL carried. `resolve` (the
   * resource's `xxxDisplayNames`) is what labels it: without it the control
   * shows that bare id until its dropdown is first opened, and the dialog is
   * remounted on every open, so that is EVERY time a link or Back restored it.
   */
  options?: FieldOptions
  /**
   * Offer an "empty" entry -- NULL_FILTER_VALUE -- on a many2one or a selection:
   * the movements with no category, the menu items with no parent.
   *
   * Named after the backend's `MultiValue(..., allow_null=...)`, but OFF by
   * default where the backend's is on: the backend's default says what it
   * ACCEPTS, this one what a screen OFFERS, and an entry for "no account" on a
   * column that is never empty is a choice that can only ever match nothing --
   * or a 422, on a field declared `allow_null=False`.
   */
  allowNull?: boolean
  /** The label of that entry, in the screen's own words ("Uncategorized"). */
  nullLabel?: string
}

/**
 * A screen's filters, keyed by the name that goes BOTH in the query string and
 * in the request. One name, so a URL is always a description of what the API
 * was asked -- there is no mapping table to get out of step.
 */
export type FilterFields = Record<string, FilterField>

/**
 * What a filter holds. A `FilterValue` that is never `undefined`: an unset
 * filter is `null`, exactly as an empty field is (see isEmpty). Keeping the two
 * apart would give "absent" and "cleared" different behaviours for no gain.
 */
export type FilterScalar = string | number | boolean | null

/**
 * What one filter holds: a scalar, or the stringified items of a multi-valued
 * one. Never an EMPTY list -- a multi-valued filter with nothing picked is
 * unset, so `null`, like every other.
 */
export type FilterEntry = FilterScalar | string[]

/** A whole filter set. Assignable to ListFilters, so it goes straight to useResourceList. */
export type FilterValues = Record<string, FilterEntry>

/** An active filter, as the toolbar shows it. */
export interface ActiveFilter {
  name: string
  label: string
  value: FilterEntry
  /** The value as a human reads it: 'Yes', a choice's label, the raw text. */
  display: string
}

/**
 * The field bound to the toolbar's search box rather than to the dialog.
 *
 * `search` is what every list endpoint of this API names its free-text filter;
 * a screen whose endpoint disagrees passes its own key.
 */
export const DEFAULT_SEARCH_KEY = 'search'

/**
 * Every declared filter, unset.
 *
 * Every key is PRESENT, holding null, and that is load-bearing rather than
 * tidy: useResourceList reads `Object.keys(filters)` once, at creation, to know
 * which query parameters it owns. A key added later would never reach the URL
 * and would never be cleared from it.
 */
export function blankFilters(fields: FilterFields): FilterValues {
  const values: FilterValues = {}
  for (const name of Object.keys(fields)) values[name] = null
  return values
}

/**
 * Is this filter doing something?
 *
 * `isEmpty`, so `false` and `0` count as ACTIVE: a boolean filter set to No is
 * a filter, and reading it as "unset" is the same bug `required` has when it
 * is written as a truthiness test.
 */
export function isFilterActive(value: FieldValue | undefined): boolean {
  return !isEmpty(value)
}

/** The control a filter is drawn with. */
export function filterWidget(field: FilterField): Widget {
  return field.widget ?? field.type
}

/** Does this filter hold a list? */
export function isListFilter(field: FilterField): boolean {
  return field.widget === 'many2many_tags'
}

/** Can this filter hold NULL_FILTER_VALUE? Only where an "empty" entry is drawn. */
function acceptsNull(field: FilterField): boolean {
  return field.allowNull === true && (field.type === 'many2one' || field.type === 'selection')
}

function nullLabel(field: FilterField): string {
  return field.nullLabel ?? DEFAULT_NULL_LABEL
}

/**
 * Narrows one value to what its filter can hold, whichever of the three
 * shapes it arrived in. `null` when the field cannot express it.
 */
export function parseFilterValue(field: FilterField, raw: FilterValueInput): FilterEntry {
  if (isListFilter(field)) return parseFilterList(field, raw)
  // A list on a scalar filter can only be a stale or hand-written value.
  if (Array.isArray(raw)) return null
  return parseFilterScalar(field, raw as FieldValue | undefined)
}

/**
 * Whatever a filter may be handed: a form value, a raw query-string value, or
 * what another writer of the filter object put there (see filterStore).
 */
export type FilterValueInput = FieldValue | ListFilters[string]

/**
 * A multi-valued filter: a list from the form, or the comma-joined string a URL
 * carries -- useResourceList restores it as that raw string.
 *
 * Each item goes through the scalar rules of `type`, so `?seats=1,x` keeps 1;
 * the survivors are deduplicated (the widget compares ids as strings, and so
 * does the backend's `IN`) and STRINGIFIED: the widget emits the numbers a
 * fetch returned and a URL gives back strings, and one canonical shape is what
 * keeps the list watchers from seeing a change where there is none.
 */
function parseFilterList(field: FilterField, raw: FilterValueInput): FilterEntry {
  if (raw === undefined || raw === null) return null
  const items = Array.isArray(raw) ? raw : String(raw).split(',')
  const out: string[] = []
  for (const item of items) {
    const parsed = parseFilterScalar(field, typeof item === 'string' ? item.trim() : item)
    if (parsed === null) continue
    const text = String(parsed)
    if (!out.includes(text)) out.push(text)
  }
  return out.length ? out : null
}

function parseFilterScalar(field: FilterField, raw: FieldValue | undefined): FilterScalar {
  if (raw === undefined || raw === null || Array.isArray(raw)) return null
  // Before the type's own rules: a selection would drop it as an unknown
  // choice, an integer as not a number.
  if (raw === NULL_FILTER_VALUE) return acceptsNull(field) ? NULL_FILTER_VALUE : null

  switch (field.type) {
    case 'boolean': {
      if (typeof raw === 'boolean') return raw
      const text = String(raw).trim().toLowerCase()
      if (text === 'true' || text === '1') return true
      if (text === 'false' || text === '0') return false
      return null
    }

    case 'integer':
    case 'float':
      return toNumberOrNull(raw)

    case 'selection': {
      // The choices are the authority on the value's TYPE: `?level=1` must
      // restore as the number 1 when that is what the choice holds, otherwise
      // <Select> matches nothing and shows its placeholder over a filter that
      // is on. An unknown choice is dropped rather than forwarded, the same way
      // readListQuery drops a sort the backend does not accept.
      const match = normaliseChoices(field.options?.choices).find(
        (choice) => String(choice.value) === String(raw),
      )
      return match ? match.value : null
    }

    default: {
      const text = String(raw).trim()
      return text === '' ? null : text
    }
  }
}

/** Every declared filter, normalised. Anything not declared is dropped. */
export function normaliseFilterValues(
  fields: FilterFields,
  values: Record<string, FilterValueInput>,
): FilterValues {
  const out: FilterValues = {}
  for (const [name, field] of Object.entries(fields)) {
    out[name] = parseFilterValue(field, values[name])
  }
  return out
}

/**
 * The filter set as the dialog's <Form> takes it.
 *
 * `normaliseFilterValues` -- see the header -- but for one difference: an
 * unset multi-valued filter is `[]`, not `null`. That is the form framework's
 * invariant for a list-valued field, and a `null` there would read as a change
 * the moment the widget emits its first `[]`. Apply goes back through
 * `parseFilterValue`, which turns `[]` into `null` again.
 */
export function filterFormData(
  fields: FilterFields,
  values: Record<string, FilterValueInput>,
): FormData {
  const data: FormData = normaliseFilterValues(fields, values)
  for (const [name, field] of Object.entries(fields)) {
    if (isListFilter(field) && data[name] === null) data[name] = []
  }
  return data
}

/**
 * The filter object useFilter hands out: one accessor per declared key over
 * `values`, whose SETTER parses.
 *
 * useResourceList and useResourceGroups write into this object too -- they
 * restore every filter from the URL as a RAW string, `"a,b"` for a list. For
 * a list request that is harmless, the string is joined already; for a
 * group-by body it is wrong, the body must carry a list, and api/ knows no
 * declaration to split it by. Parsing on write keeps every value typed,
 * whoever writes it, with neither composable having to learn about filters.
 *
 * Accessors on a plain object rather than a Proxy: `values` is the reactive
 * record, so reading through a getter is tracked like reading it directly, and
 * enumerable accessors keep `Object.keys` -- which useResourceList reads once
 * to know the keys it owns -- and JSON.stringify working as they did.
 */
export function filterStore(fields: FilterFields, values: FilterValues): FilterValues {
  const store: FilterValues = {}
  for (const [name, field] of Object.entries(fields)) {
    Object.defineProperty(store, name, {
      enumerable: true,
      get: () => values[name],
      set: (raw: FilterValueInput) => {
        values[name] = parseFilterValue(field, raw)
      },
    })
  }
  return store
}

/**
 * A query string -> the filters it carries. Pure: no router, no side effect.
 *
 * Reads through `readListQuery`, the list's own reader, rather than walking the
 * query itself: that is what already refuses an array-valued parameter (a
 * repeated `?tag=` must not smuggle a list into a scalar filter) and what keeps
 * `page`, `page_size` and `ordering` from ever being read as filters -- a field
 * declared under one of those names simply never restores.
 *
 * Only DECLARED keys are read: a hostile link must not be able to inject a
 * filter the screen never offered.
 */
export function filtersFromQuery(fields: FilterFields, query: QueryLike): FilterValues {
  const carried = readListQuery(query).filters
  const values = blankFilters(fields)
  for (const [name, field] of Object.entries(fields)) {
    if (name in carried) values[name] = parseFilterValue(field, carried[name])
  }
  return values
}

/**
 * One filter value, as a human reads it. Empty string when the filter is unset.
 *
 * A multi-valued filter is COUNTED, not listed: its labels belong to a fetch
 * this module cannot make, and a row of bare ids is no reading at all.
 */
export function filterDisplay(field: FilterField, value: FilterValueInput): string {
  const parsed = parseFilterValue(field, value)
  if (parsed === null) return ''
  if (Array.isArray(parsed)) {
    // One item reads as the scalar filter would: a choice's label, or the token's.
    if (parsed.length === 1) return filterDisplay({ ...field, widget: undefined }, parsed[0])
    return `${parsed.length} selected`
  }
  if (parsed === NULL_FILTER_VALUE) return nullLabel(field)

  if (field.type === 'boolean') return parsed ? 'Yes' : 'No'
  if (field.type === 'selection') {
    const match = normaliseChoices(field.options?.choices).find(
      (choice) => choice.value === parsed,
    )
    if (match) return match.label
  }
  return String(parsed)
}

/**
 * The filters currently doing something, in declaration order.
 *
 * `skip` drops the search field: it has its own visible box in the toolbar, so
 * counting it in the button's badge would tell the user that a filter is hidden
 * behind a dialog when it is in fact right next to it.
 */
export function activeFilterEntries(
  fields: FilterFields,
  values: Record<string, FilterValueInput>,
  skip?: string,
): ActiveFilter[] {
  const active: ActiveFilter[] = []
  for (const [name, field] of Object.entries(fields)) {
    if (name === skip) continue
    const value = parseFilterValue(field, values[name])
    if (!isFilterActive(value)) continue
    active.push({ name, label: field.label, value, display: filterDisplay(field, value) })
  }
  return active
}

/**
 * The filters the dialog offers: every declared one but the search field,
 * which already has its box in the toolbar -- two controls over one value can
 * only disagree.
 *
 * An EMPTY result is what hides the Filters button altogether: a list that
 * declares nothing but its search has nothing behind that button, and a
 * dialog saying so is a click spent learning nothing.
 */
export function dialogFilterEntries(
  fields: FilterFields,
  searchKey: string,
): [name: string, field: FilterField][] {
  return Object.entries(fields).filter(([name]) => name !== searchKey)
}

// ------------------------------------------------------------ widget options

/** The entry standing for NULL_FILTER_VALUE among a relation's candidates. */
function nullRecord(field: FilterField): RelationRecord {
  return { id: NULL_FILTER_VALUE, name: nullLabel(field) }
}

/** Does `label` match what the user typed? The local search of a synthesised list. */
function matchesSearch(label: string, search: string | null): boolean {
  const term = search?.trim().toLowerCase() ?? ''
  return term === '' || label.toLowerCase().includes(term)
}

/**
 * The options the dialog hands to a filter's <Field>: the declared ones, plus
 * what makes the two filter-only capabilities work with UNCHANGED widgets.
 *
 * - `allowNull`: the "empty" entry is put in front of the candidates -- one more
 *   choice for a selection, a record whose id is NULL_FILTER_VALUE for a
 *   relation, with `resolve` answering for it locally. The widget only ever
 *   sees an ordinary id; teaching it a null entry instead would have widened
 *   the form framework for a concept only filters have.
 * - a multi-valued selection: ManyToManyTagsField loads its candidates through
 *   `fetch`, so the choices are served through one, searched locally -- a
 *   multiselect widget of its own would have been a second registry entry for
 *   a dropdown we already have.
 *
 * A NEW object, built once per field by the caller: a fresh one on every
 * render would hand the widget new options each time.
 */
export function filterWidgetOptions(field: FilterField): FieldOptions {
  const options: FieldOptions = { ...field.options }
  const allowNull = acceptsNull(field)

  if (field.type === 'selection') {
    const choices: SelectionChoice[] = [
      ...(allowNull ? [{ value: NULL_FILTER_VALUE, label: nullLabel(field) }] : []),
      ...normaliseChoices(field.options?.choices),
    ]
    options.choices = choices
    if (isListFilter(field)) {
      // Stringified ids: a list filter's items are strings (see parseFilterList),
      // and the chips must find the record of the id they hold.
      const records: RelationRecord[] = choices.map((choice) => ({
        id: String(choice.value),
        name: choice.label,
      }))
      options.fetch = async (search) =>
        records.filter((record) => matchesSearch(String(record.name), search))
      options.resolve = async (ids) => records.filter((record) => ids.includes(String(record.id)))
    }
    return options
  }

  if (field.type === 'many2one' && allowNull) {
    const fetch = field.options?.fetch
    const resolve = field.options?.resolve
    const display = field.options?.relationDisplay ?? displayRelation
    const entry = nullRecord(field)
    // The entry is labelled HERE, whatever the screen's own display reads: a
    // `relationDisplay` written for the endpoint's rows (a user's `login`, a
    // page's `title`) finds nothing on it and falls back to the id -- the
    // dropdown then offered "null" instead of "Nobody".
    options.relationDisplay = (record) =>
      record.id === NULL_FILTER_VALUE ? nullLabel(field) : display(record)
    if (fetch) {
      options.fetch = async (search, signal) => {
        const rows = await fetch(search, signal)
        return matchesSearch(String(entry.name), search) ? [entry, ...rows] : rows
      }
    }
    options.resolve = async (ids, signal) => {
      const others = ids.filter((id) => id !== NULL_FILTER_VALUE)
      // Not asked of the endpoint: `null` is no id of its, and an endpoint
      // validating its ids (a ULID) would refuse the whole request.
      const rows = others.length && resolve ? await resolve(others, signal) : []
      return ids.includes(NULL_FILTER_VALUE) ? [entry, ...rows] : rows
    }
  }

  return options
}

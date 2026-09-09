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
 * The last two are deliberately the SAME shape: a query parameter is a scalar,
 * so for the widget types a filter is allowed to use, the value the form holds
 * is already the value the wire wants. That is what FilterType is a restricted
 * subset of Widget for, and it is why one `parseFilterValue` serves both
 * directions.
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

import { readListQuery, type QueryLike } from '@/api/list'
import type { FormData } from '@/components/form/context'
import type { FieldOptions, FieldValue, Widget } from '@/components/form/fields/types'
import { isEmpty, normaliseChoices, toNumberOrNull } from '@/components/form/fields/values'

/**
 * The widgets a filter may use.
 *
 * An `Extract` of `Widget` rather than a list of its own: renaming a widget
 * then breaks here, at compile time, instead of rendering an error <Message>
 * inside the dialog. What is left out is left out for a reason -- a query
 * parameter is a scalar, so `many2many_tags` has no shape to take here, and
 * `text`, `html` and `color` are controls nobody filters a list with.
 */
export type FilterType = Extract<
  Widget,
  'string' | 'boolean' | 'integer' | 'float' | 'selection' | 'date' | 'datetime' | 'many2one'
>

/** One declared filter. The dict's KEY is the query parameter name. */
export interface FilterField {
  type: FilterType
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
   * Forwarded to the widget: `choices` for a selection, `fetch` for a many2one.
   *
   * A many2one filter cannot carry `record`, unlike one on a form -- there is
   * no fetched row behind a filter, only the id a URL carried -- so the control
   * shows that bare id until its dropdown is first opened. That is
   * ManyToOneField's documented behaviour, and it is why a filter is better
   * declared as a `selection` whenever the candidates are a short fixed list.
   */
  options?: FieldOptions
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

/** A whole filter set. Assignable to ListFilters, so it goes straight to useResourceList. */
export type FilterValues = Record<string, FilterScalar>

/** An active filter, as the toolbar shows it. */
export interface ActiveFilter {
  name: string
  label: string
  value: FilterScalar
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

/**
 * Narrows one value to what its filter type can hold, whichever of the three
 * shapes it arrived in. `null` when the field cannot express it.
 */
export function parseFilterValue(field: FilterField, raw: FieldValue | undefined): FilterScalar {
  if (raw === undefined || raw === null) return null
  // A list has no query-parameter form; FilterType excludes the widgets that
  // produce one, so this can only be a stale or hand-written value.
  if (Array.isArray(raw)) return null

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
  values: Record<string, FieldValue | undefined>,
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
 * Structurally the same thing as `normaliseFilterValues` -- see the header --
 * and kept as its own name because the two call sites mean different things,
 * and because the return type is what the form framework expects.
 */
export function filterFormData(
  fields: FilterFields,
  values: Record<string, FieldValue | undefined>,
): FormData {
  return normaliseFilterValues(fields, values)
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

/** One filter value, as a human reads it. Empty string when the filter is unset. */
export function filterDisplay(field: FilterField, value: FieldValue | undefined): string {
  const parsed = parseFilterValue(field, value)
  if (parsed === null) return ''

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
  values: Record<string, FieldValue | undefined>,
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

/**
 * GET /api/v1/countries/ -- the ISO country table.
 *
 * Read-only: the backend controller exposes `read` alone, gated on the
 * `totem.country.read` permission, and the rows come from a system fixture. No
 * screen of this application lists countries; the endpoint exists to fill the
 * relation dropdowns of the forms that point at one.
 */

import { fetchAllPages } from '@/api/list'

/**
 * One entry of the list.
 *
 * The primary key IS the ISO 3166-1 alpha-2 code; the backend aliases it to
 * `id` so a country reads like every other relation and a client always has an
 * `id` to use as the value of a select.
 *
 * A `type` and not an `interface`, for the same reason as ContactFilters: only
 * type aliases get the implicit index signature that makes them assignable to
 * `RelationRecord`, which is what the many2one widget takes.
 */
export type CountryRef = {
  /** ISO 3166-1 alpha-2, e.g. 'BE'. */
  id: string
  name: string
}

/**
 * List responses are serialised with `exclude_unset=True`, so ONLY the keys
 * asked for in `?fields=` come back -- and an unknown name is a 422, which is
 * why this list lives next to the endpoint rather than in a template.
 */
export const COUNTRY_LIST_FIELDS = ['id', 'name'] as const satisfies readonly (keyof CountryRef)[]

/**
 * The loader of the country dropdown: `RelationFetch` shaped.
 *
 * `search` is the parameter name THIS endpoint uses, and the backend matches it
 * against the name or the ISO code, case-insensitively -- which is what lets
 * "IE" find Ireland. A relation whose endpoint names its filter differently
 * passes its own function; nothing about the widget hardcodes `search`.
 *
 * No `ordering` is sent: `name` and `code` are the only fields the backend
 * whitelists, and the dropdown has to be sorted by what it DISPLAYS, which is a
 * client-side notion -- see toRelationOptions.
 */
export function searchCountries(
  search: string | null,
  signal?: AbortSignal,
): Promise<CountryRef[]> {
  return fetchAllPages<CountryRef>(
    '/countries/',
    COUNTRY_LIST_FIELDS,
    { filters: { search } },
    signal,
  )
}

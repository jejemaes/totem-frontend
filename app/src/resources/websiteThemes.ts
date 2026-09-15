/*
 * /api/v1/website/themes/ -- the theme catalogue, and the layout vocabulary a
 * page picks from.
 *
 * An odd resource, for the same reasons as websiteWidgets:
 *
 *  - there is NO ROW behind it. A theme is a class in the backend's registry,
 *    filled at startup by `autodiscover_modules('theme')`, and a layout id is a
 *    module constant. Only the SELECTION is stored, on `Website.theme` and
 *    `Page.layout` -- so there is no Row/Detail pair, no `?fields=`, no create
 *    and no update.
 *  - it is NOT PAGINATED: `@route.get` answers a bare `List[LayoutSchema]`, not
 *    a controller list route picking up `PageNumberPagination`. Hence no
 *    `fetchList` here.
 *
 * Both routes live behind the same scope, `totem.websitetheme.read`.
 *
 * `ThemeSchema.option_schema` -- the JSON Schema of the options a theme
 * declares -- is deliberately NOT typed further here, for the same reason
 * `HtmlWidgetSchema.attribute_schema` is not: the shapes it can take are an
 * editor's problem, and nothing in this app builds that settings form yet.
 */

import { apiFetch } from '@/api/client'
import type { RelationFetch, RelationRecord } from '@/components/form/fields/many2one'

/**
 * One entry of the layout vocabulary: the id stored on the page, and the label
 * to show for it.
 *
 * A `type` and not an `interface`, like every other `XxxRef` here: only type
 * aliases get the implicit index signature that makes them assignable to
 * `RelationRecord`, which is what the relation widgets take.
 */
export type WebsiteLayoutRef = {
  /** What `Page.layout` holds -- `full-width`, `sidebar-left`, … */
  id: string
  title: string
}

/**
 * One entry of the theme catalogue: the id stored on the website, and the label
 * to show for it.
 *
 * A `type`, like every other `XxxRef` here, so it stays assignable to
 * `RelationRecord`. `layouts` and `option_schema` come back too and are simply
 * carried: only the picker uses this endpoint today.
 */
export type WebsiteThemeRef = {
  /** What `Website.theme` holds -- `default`, … */
  id: string
  title: string
}

/**
 * Tolerates the paginated envelope as well as the bare array.
 *
 * Same guard as `toWidgetTypes`, and for the same reason: the route answers an
 * array today, but every LIST route in the app answers `{count, results}`.
 * Should this one ever grow the envelope, the picker would otherwise offer no
 * layout at all with nothing in the console to say why -- an envelope is a
 * perfectly valid object that simply has no length.
 */
function toRegistry<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: T[] }).results
  }
  return []
}

/** The layout vocabulary, from whatever `GET /website/themes/layouts/` answered. */
export function toLayouts(payload: unknown): WebsiteLayoutRef[] {
  return toRegistry<WebsiteLayoutRef>(payload)
}

/** The theme catalogue, from whatever `GET /website/themes/` answered. */
export function toThemes(payload: unknown): WebsiteThemeRef[] {
  return toRegistry<WebsiteThemeRef>(payload)
}

/** The whole vocabulary. It is a handful of entries, closed and code-owned. */
export async function listWebsiteLayouts(signal?: AbortSignal): Promise<WebsiteLayoutRef[]> {
  // The trailing slash is mandatory, like every path in this app.
  return toLayouts(await apiFetch<unknown>('/website/themes/layouts/', { signal }))
}

/**
 * The loader of the layout dropdown: `RelationFetch` shaped.
 *
 * The search term is IGNORED, and deliberately: the route takes no filter
 * parameter -- it returns the entire vocabulary, a handful of entries. The
 * field that uses it therefore turns the dropdown's filter box off
 * (`options.filter: false`), so nothing ever hands a term to this function; the
 * parameter is kept only because `RelationFetch` declares it.
 */
export const searchWebsiteLayouts: RelationFetch = (_search, signal) =>
  listWebsiteLayouts(signal)

/**
 * The label of a layout, in the dropdown and in a read-only relation field.
 *
 * The generic `displayRelation` reads `name`, which this vocabulary does not
 * have: its human key is `title`. The id is the fallback, and it is a real one
 * here rather than a last resort -- it is what labels the current value before
 * the vocabulary has been loaded.
 */
export function displayLayout(record: RelationRecord): string {
  const title = record.title
  if (typeof title === 'string' && title.trim() !== '') return title.trim()
  return String(record.id)
}

/** The whole catalogue. A registry filled at startup, so it is small too. */
export async function listWebsiteThemes(signal?: AbortSignal): Promise<WebsiteThemeRef[]> {
  return toThemes(await apiFetch<unknown>('/website/themes/', { signal }))
}

/**
 * The loader of the theme dropdown: `RelationFetch` shaped.
 *
 * The search term is IGNORED, exactly as for the layouts above and for the same
 * reason: the route takes no filter parameter, and the field that uses it turns
 * the dropdown's filter box off.
 */
export const searchWebsiteThemes: RelationFetch = (_search, signal) =>
  listWebsiteThemes(signal)

/**
 * The label of a theme. Same shape as `displayLayout`, and separate from it on
 * purpose: these are two vocabularies, and one of them growing a second label
 * key must not move the other.
 */
export function displayTheme(record: RelationRecord): string {
  const title = record.title
  if (typeof title === 'string' && title.trim() !== '') return title.trim()
  return String(record.id)
}

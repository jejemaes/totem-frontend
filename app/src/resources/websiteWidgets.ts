/*
 * /api/v1/website/widgets/ -- the kinds of block an author can drop into
 * website content, and the parameters each one takes.
 *
 * The odd one out among the resource modules, in three ways:
 *
 *  - it is READ-ONLY and has no row. A widget is a class in the backend's
 *    registry, filled at startup by `autodiscover_modules('html_widget')`; the
 *    parameters travel inline with each marker instead of in a table. So there
 *    is no Row/Detail pair, no `?fields=`, no create or update.
 *  - it is NOT PAGINATED. The route is a hand-written `@route.get` returning a
 *    bare `List[HtmlWidgetSchema]`, not a controller whose list route picks up
 *    `PageNumberPagination` -- the registry is small and in memory. That is why
 *    this file does not use `fetchList` like every list screen does.
 *  - `attribute_schema` is JSON Schema, verbatim from pydantic's
 *    `model_json_schema()`. It is deliberately NOT typed further here: the
 *    shapes it can take are the editor's problem, and they are mapped and
 *    tested in components/form/fields/htmlWidget.ts.
 *
 * Scope: `totem.websitewidget.read`. Note it is registered backend-side but is
 * not granted by any role fixture yet, so a token will hold it only once those
 * are updated -- until then this answers 403 and HtmlField hides its button.
 */

import { apiFetch } from '@/api/client'
import type { HtmlWidgetFetch, HtmlWidgetType } from '@/components/form/fields/html'

/** Re-exported so a view can name the type without reaching into the widget. */
export type { HtmlWidgetType }

/**
 * Tolerates the paginated envelope as well as the bare array.
 *
 * The route answers an array today. Should it ever grow the standard
 * `{count, results}` envelope -- which is what every other list route in the
 * app returns -- the editor would otherwise show "no widget available" with
 * nothing in the console to say why, because an envelope is a perfectly valid
 * object that simply has no length.
 */
export function toWidgetTypes(payload: unknown): HtmlWidgetType[] {
  if (Array.isArray(payload)) return payload as HtmlWidgetType[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: HtmlWidgetType[] }).results
  }
  return []
}

/** Typed as `HtmlWidgetFetch` so it drops straight into `options.fetchWidgets`. */
export const fetchWebsiteWidgets: HtmlWidgetFetch = async (signal) => {
  // The trailing slash is mandatory, like every path in this app.
  const payload = await apiFetch<unknown>('/website/widgets/', { signal })
  return toWidgetTypes(payload)
}
